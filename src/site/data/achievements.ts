export type Achievement = {
  id: string;
  title: string;
  text: string;
  year?: string;
};

/** Add an item only when NCCS can verify it. No awards, rankings, or partnerships by assumption. */
export const achievements: Achievement[] = [];
