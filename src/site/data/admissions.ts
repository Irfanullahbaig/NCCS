export type AdmissionStep = {
  number: string;
  title: string;
  text: string;
};

export const admissionsIntro =
  "Prospective students and parents can begin by getting in touch with NCCS, visiting the college in Gilgit, and completing admission with the office.";

export const admissionSteps: AdmissionStep[] = [
  {
    number: "01",
    title: "Get in Touch",
    text: "Reach the NCCS office and tell us about the student who hopes to join.",
  },
  {
    number: "02",
    title: "Visit NCCS",
    text: "Come to the college in Gilgit and speak with the people who guide admission.",
  },
  {
    number: "03",
    title: "Complete Admission",
    text: "Finish the admission process directly with the NCCS office.",
  },
];
