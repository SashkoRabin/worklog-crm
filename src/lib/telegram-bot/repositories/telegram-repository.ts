import type { Account, Lang, Shift } from "../config";
import { createAdminClient } from "@/lib/telegram-server";

export async function getTelegramAccount(telegramUserId: number, chatId?: number) {
  const db = createAdminClient();
  if (chatId !== undefined) {
    const { error: upsertError } = await db.from("telegram_accounts")
      .upsert({ telegram_user_id: telegramUserId, chat_id: chatId }, { onConflict: "telegram_user_id", ignoreDuplicates: true });
    if (upsertError) throw upsertError;
  }
  const { data, error } = await db.from("telegram_accounts")
    .select("language,reminders_enabled,timezone,linked_user_id")
    .eq("telegram_user_id", telegramUserId).single();
  if (error) throw error;
  return data as Account;
}

export async function updateTelegramLanguage(telegramUserId: number, language: Lang) {
  const { error } = await createAdminClient().from("telegram_accounts")
    .update({ language }).eq("telegram_user_id", telegramUserId);
  if (error) throw error;
}

export async function createBroadcast(message: string, createdBy: number) {
  const { data, error } = await createAdminClient().from("telegram_broadcasts")
    .insert({ message, created_by: createdBy, status: "draft" }).select("id").single();
  if (error) throw error;
  return data;
}

export async function claimBroadcast(id: string, createdBy: number) {
  const { data, error } = await createAdminClient().from("telegram_broadcasts")
    .update({ status: "sending" }).eq("id", id).eq("created_by", createdBy)
    .eq("status", "draft").select("id,message").maybeSingle();
  if (error) throw error;
  return data;
}

export async function finishBroadcast(id: string, status: string, sent: number, failed: number) {
  const { error } = await createAdminClient().from("telegram_broadcasts")
    .update({ status, sent_count: sent, failed_count: failed, finished_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function listBroadcastRecipients() {
  const { data, error } = await createAdminClient().from("telegram_accounts")
    .select("chat_id").not("linked_user_id", "is", null);
  if (error) throw error;
  return data || [];
}
