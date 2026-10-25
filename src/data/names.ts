import { unique } from "../core/text.ts";

// Hand-written lists of given names and surnames.
// "Common" = very popular names; "Uncommon" = real but rarer names.
// The "Invented" level trains a Markov model on both lists.

export const INDIAN_FEMALE = unique([
  "aanya", "aditi", "ananya", "anika", "avni", "diya", "ishita", "kavya", "meera", "myra",
  "navya", "neha", "pooja", "priya", "riya", "saanvi", "sanya", "shreya", "tanvi", "trisha",
  "zara", "kiara", "ira", "nisha", "pallavi", "radhika", "sneha", "tara", "aarohi", "ishani",
]);

export const INDIAN_FEMALE_UNCOMMON = unique([
  "aadya", "anvi", "kyra", "mihika", "nitara", "prisha", "reeva", "saisha", "vanya", "zoya",
  "ahana", "aarna", "inaaya", "keya", "nyra", "shanaya", "yashvi", "avyukta", "kashvi", "mahika",
  "siya", "tiara", "vaidehi", "charvi", "devanshi", "eshana", "hiral", "jivika", "laasya", "oorja",
]);

export const INDIAN_MALE = unique([
  "aarav", "aditya", "arjun", "aryan", "dev", "dhruv", "ishaan", "kabir", "karan", "krish",
  "manav", "nikhil", "pranav", "rahul", "reyansh", "rohan", "sahil", "shaurya", "siddharth", "vihaan",
  "vivaan", "yash", "arnav", "kunal", "parth", "rudra", "tanay", "varun", "ayaan", "aakash",
]);

export const INDIAN_MALE_UNCOMMON = unique([
  "aadvik", "ahaan", "ekansh", "hiyan", "ivaan", "kiaan", "nirvaan", "rishaan", "shlok", "viraj",
  "yuvaan", "advait", "arnesh", "darsh", "hridaan", "neev", "ojas", "shivaay", "vedant", "aranya",
  "bodhi", "chirag", "daksh", "eklavya", "garv", "hitansh", "jivin", "lakshit", "moksh", "tanmay",
]);

export const INDIAN_SURNAMES = unique([
  "agarwal", "bose", "chopra", "das", "desai", "gupta", "iyer", "jain", "joshi", "kapoor",
  "khan", "kulkarni", "kumar", "mehta", "menon", "mishra", "nair", "patel", "pillai", "rao",
  "reddy", "saxena", "sharma", "singh", "sinha", "verma", "yadav", "malhotra", "bhatt", "thakur",
]);

export const INDIAN_SURNAMES_UNCOMMON = unique([
  "adhikari", "bhandari", "chaturvedi", "deshpande", "gokhale", "hegde", "kalra", "kashyap", "lahiri", "mukherjee",
  "oberoi", "pandit", "raina", "sengupta", "tandon", "upadhyay", "vohra", "wadhwa", "zaveri", "bhattacharya",
  "rawat", "negi", "bisht", "pant", "naidu", "shetty", "dutta", "khanna", "mahajan", "srinivasan",
]);

export const INTL_FEMALE = unique([
  "amelia", "ava", "charlotte", "chloe", "clara", "elena", "emma", "grace", "hannah", "isla",
  "lena", "lucia", "maya", "mia", "nora", "olivia", "ruby", "sofia", "zoe", "freya",
  "hana", "yuki", "amara", "leila", "ines",
]);

export const INTL_FEMALE_UNCOMMON = unique([
  "aurelia", "elowen", "isolde", "juniper", "linnea", "marisol", "odessa", "saoirse", "wren", "zinnia",
  "calla", "thea", "seraphina", "ottilie", "anouk", "brielle", "cosima", "delphine", "esme", "imogen",
  "liesel", "maren", "noemi", "rosalind", "sienna",
]);

export const INTL_MALE = unique([
  "adam", "alex", "ben", "carlos", "daniel", "elias", "ethan", "felix", "hugo", "jack",
  "james", "kai", "leo", "liam", "lucas", "mateo", "noah", "oliver", "omar", "oscar",
  "theo", "finn", "kenji", "luca", "samuel",
]);

export const INTL_MALE_UNCOMMON = unique([
  "alaric", "caspian", "cassius", "evander", "lorcan", "matthias", "orion", "ronan", "silas", "soren",
  "thaddeus", "ansel", "bastian", "cyrus", "dorian", "ezra", "leander", "rafferty", "anselm", "booker",
  "crispin", "emrys", "florian", "ignatius", "lazlo",
]);

export const INTL_SURNAMES = unique([
  "anderson", "brown", "carter", "clark", "garcia", "hughes", "kim", "lee", "lopez", "martin",
  "miller", "nguyen", "rossi", "santos", "silva", "smith", "taylor", "walker", "wilson", "young",
]);

export const INTL_SURNAMES_UNCOMMON = unique([
  "ashford", "blackwood", "castellano", "delacroix", "everhart", "fairbanks", "hawthorne", "lindqvist", "montague", "nakamura",
  "okafor", "quintero", "ravensworth", "sorensen", "takahashi", "vasquez", "whitlock", "zielinski", "moreau", "kowalski",
  "dubois", "novak", "tanaka", "hansen", "ito",
]);
