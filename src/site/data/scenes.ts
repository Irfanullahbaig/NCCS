export type Scene = {
  id: string;
  label: string;
  image: string;
  alt: string;
  focal?: string;
};

/**
 * These photographs show Gilgit-Baltistan, not confirmed NCCS rooms.
 * Replace each entry with a verified campus, facility, or student photograph
 * before describing it as part of the college.
 *
 * Sources: Unsplash (license allows use). Photo ids are noted beside each file
 * in case credit is wanted later.
 * hero.jpg      photo-1667922210719-566cbfec2b11
 * slope.jpg     photo-1611821427154-edd4d40d7ea5
 * cloud.jpg     photo-1660387269357-3dc4a654b675
 * lake.jpg      photo-1631952245193-65d4a2caa23f
 * river.jpg     photo-1611821824288-95e977eab064
 * peaks.jpg     photo-1611821887389-cd0ae7ebfff4
 * writing.jpg   photo-1434030216411-0b793f4b4173
 * bridge.jpg    photo-1626440870825-d23b832fd32d
 * ridge.jpg     photo-1626440847069-d8073e1a0cca
 * books.jpg     photo-1497633762265-9d179a990aa6
 */

export const heroImage = {
  src: "/site/images/classroom.jpg",
  alt: "Students and a teacher working together in a classroom",
  focal: "center center",
};

export const aboutImage = {
  src: "/site/images/about-class.jpg",
  alt: "Students studying together around a laptop in a classroom",
  focal: "center center",
};

export const facilities: Scene[] = [
  {
    id: "classroom",
    label: "Classroom",
    image: "/site/images/students-class.jpg",
    alt: "Students taking notes while a teacher stands by the whiteboard",
    focal: "center center",
  },
  {
    id: "together",
    label: "Together",
    image: "/site/images/students-group.jpg",
    alt: "Students working together at a desk with notebooks and a laptop",
    focal: "center center",
  },
  {
    id: "in-class",
    label: "In class",
    image: "/site/images/classroom.jpg",
    alt: "A teacher helping students during a lesson",
    focal: "center center",
  },
  {
    id: "college",
    label: "The college",
    image: "/site/images/students-hall.jpg",
    alt: "Students walking and talking in a college hallway",
    focal: "center center",
  },
  {
    id: "reading",
    label: "Reading",
    image: "/site/images/students-reading.jpg",
    alt: "Students reading and writing at a classroom table",
    focal: "center 40%",
  },
];

export const schoolLife: Scene[] = [
  {
    id: "hallway",
    label: "Between classes",
    image: "/site/images/students-hall.jpg",
    alt: "Students walking together in a college corridor",
    focal: "center center",
  },
  {
    id: "group",
    label: "Working together",
    image: "/site/images/students-group.jpg",
    alt: "A group of students collaborating over books and a laptop",
    focal: "center center",
  },
  {
    id: "study",
    label: "Study",
    image: "/site/images/students-reading.jpg",
    alt: "Students studying side by side in class",
    focal: "center 35%",
  },
];

export const ctaImage = {
  src: "/site/images/students-class.jpg",
  alt: "A college classroom with students at their desks",
  focal: "center 40%",
};
