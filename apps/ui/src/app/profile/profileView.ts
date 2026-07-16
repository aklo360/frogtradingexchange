export const PROFILE_NFT_PAGE_SIZE = 8;

export type ProfileMilestone = {
  id: "hotshot" | "samurai" | "trailblazer";
  label: string;
  icon: string;
  earned: boolean;
  progress: string;
};

export const deriveDefaultUsername = (address: string) =>
  `frog-${address.slice(0, 4)}${address.slice(-2)}`.toLowerCase();

export const formatShortAddress = (address: string) =>
  address.length > 10
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : address;

/*
  Achievements are derived only from verified Business Frog holdings reported
  by the FTX Worker; no social or trade metrics are fabricated client-side.
*/
export const buildProfileMilestones = (input: {
  frogCount: number;
}): ProfileMilestone[] => [
  {
    id: "hotshot",
    label: "Hotshot",
    icon: "/badge-hotshot.svg",
    earned: input.frogCount >= 1,
    progress: `${Math.min(input.frogCount, 1)}/1 frog held`,
  },
  {
    id: "samurai",
    label: "Samurai",
    icon: "/badge-samurai.svg",
    earned: input.frogCount >= 5,
    progress: `${Math.min(input.frogCount, 5)}/5 frogs held`,
  },
  {
    id: "trailblazer",
    label: "Trailblazer",
    icon: "/badge-trailblazer.svg",
    earned: input.frogCount >= 15,
    progress: `${Math.min(input.frogCount, 15)}/15 frogs held`,
  },
];

/*
  Profile-frog selection persists per wallet in browser storage until an
  FTX-native profile store exists server-side.
*/
export type StoredPfp = { mint: string; image: string | null };

const pfpStorageKey = (walletAddress: string) =>
  `ftx-profile-pfp:${walletAddress}`;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export const loadStoredPfp = (
  walletAddress: string,
  storage: ReadableStorage | null | undefined,
): StoredPfp | null => {
  if (!walletAddress || !storage) return null;
  try {
    const raw = storage.getItem(pfpStorageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPfp> | null;
    if (typeof parsed?.mint !== "string" || !parsed.mint) return null;
    return {
      mint: parsed.mint,
      image: typeof parsed.image === "string" ? parsed.image : null,
    };
  } catch {
    return null;
  }
};

export const storePfp = (
  walletAddress: string,
  storage: WritableStorage | null | undefined,
  pfp: StoredPfp,
) => {
  if (!walletAddress || !storage) return;
  try {
    storage.setItem(pfpStorageKey(walletAddress), JSON.stringify(pfp));
  } catch {
    // Storage may be unavailable (private mode); selection stays in memory.
  }
};
