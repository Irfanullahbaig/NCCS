export type Statistic = {
  value: string;
  label: string;
};

/** Only facts taken from the college name, place, and founding year. No headcounts. */
export const statistics: Statistic[] = [
  { value: "2018", label: "Founded" },
  { value: "Gilgit", label: "Gilgit-Baltistan" },
  { value: "NCCS", label: "Commerce and Computer Science" },
];
