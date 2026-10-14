export type Store = {
  id: string;
  name: string;
  hours: number;
  shifts: { label: string; start: string; end: string; hours: number }[];
};

export const stores: Store[] = [
  { id: "narodni", name: "Narodni", hours: 7.5, shifts: [{ label: "День", start: "10:00", end: "17:30", hours: 7.5 }, { label: "Вечер", start: "17:30", end: "01:00", hours: 7.5 }, { label: "Весь день", start: "10:00", end: "01:00", hours: 15 }] },
  { id: "karlova", name: "Karlova", hours: 7.5, shifts: [{ label: "День", start: "10:00", end: "17:30", hours: 7.5 }, { label: "Вечер", start: "17:30", end: "01:00", hours: 7.5 }, { label: "Весь день", start: "10:00", end: "01:00", hours: 15 }] },
  ...["Kaprova", "Opletalova", "Karlak", "Revolucni"].map((name) => ({ id: name.toLowerCase(), name, hours: 7, shifts: [{ label: "День", start: "10:00", end: "17:00", hours: 7 }, { label: "Вечер", start: "17:00", end: "00:00", hours: 7 }, { label: "Весь день", start: "10:00", end: "00:00", hours: 14 }] })),
  ...["Karlovy Lazne", "Karlin"].map((name) => ({ id: name.toLowerCase().replace(" ", "-"), name, hours: 6, shifts: [{ label: "День", start: "10:00", end: "16:00", hours: 6 }, { label: "Вечер", start: "16:00", end: "22:00", hours: 6 }, { label: "Весь день", start: "10:00", end: "22:00", hours: 12 }] })),
];

export const shiftLabels = { worked: "Отработано", replacement: "Замена", assigned: "Выданная смена" } as const;
