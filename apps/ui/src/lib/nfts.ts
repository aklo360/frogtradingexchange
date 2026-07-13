export type NftHolding = {
  mint: string;
  name: string;
  description: string | null;
  image: string | null;
  collection: string | null;
  owner: string;
  compressed: boolean;
  attributes: Array<{ traitType: string; value: string | number }>;
};

export type NftHoldingsPage = {
  walletAddress: string;
  items: NftHolding[];
  page: number;
  limit: number;
  total: number;
};
