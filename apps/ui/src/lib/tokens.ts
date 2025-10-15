export type TokenOption = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
  featured?: boolean;
};

export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";

export const DEFAULT_TOKEN_OPTIONS: TokenOption[] = [
  {
    mint: WRAPPED_SOL_MINT,
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "USDT",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  },
  {
    mint: "6dhTynDkYsVM7cbF7TKfC9DWB636TcEM935fq7JzL2ES",
    symbol: "BONK",
    name: "BONK",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/6dhTynDkYsVM7cbF7TKfC9DWB636TcEM935fq7JzL2ES/logo.png",
  },
  {
    mint: "Coq3LbB52jzCxk5W8SJTyK3SB83sYTKEjs2JmHaoSGxS",
    symbol: "WIF",
    name: "dogwifhat",
    decimals: 9,
    logoURI:
      "https://raw.githubusercontent.com/FullMoonMiningCo/logos/main/wif-logo.png",
  },
  {
    mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    symbol: "SAMO",
    name: "Samoyed Coin",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png",
  },
  {
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    symbol: "mSOL",
    name: "Marinade Staked SOL",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  },
  {
    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    symbol: "bSOL",
    name: "BlazeStake Staked SOL",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
  },
  {
    mint: "5VsPJ2EG7jjo3k2LPzQVriENKKQkNUTzujEzuaj4Aisf",
    symbol: "ROCK",
    name: "Zenrock",
    decimals: 6,
    isVerified: true,
    featured: true,
    logoURI:
      "https://spl-token-metadata.s3.eu-west-1.amazonaws.com/chain.png",
  },
  {
    mint: "9hX59xHHnaZXLU6quvm5uGY2iDiT3jczaReHy6A6TYKw",
    symbol: "zenBTC",
    name: "Zenrock BTC",
    decimals: 8,
    isVerified: true,
    featured: true,
    logoURI:
      "https://zenrock-public-images.s3.eu-west-1.amazonaws.com/zenBTC-logo.svg",
  },
  {
    mint: "H4phNbsqjV5rqk8u6FUACTLB6rNZRTAPGnBb8KXJpump",
    symbol: "SSE",
    name: "Solana Social Explorer",
    decimals: 6,
    isVerified: true,
    featured: true,
    logoURI:
      "https://ipfs.io/ipfs/QmT4fG3jhXv3dcvEVdkvAqi8RjXEmEcLS48PsUA5zSb1RY",
  },
];

export const DEFAULT_TOKEN_MAP = new Map(
  DEFAULT_TOKEN_OPTIONS.map((token) => [token.mint, token]),
);

export const TRENDING_TOKEN_MINTS = DEFAULT_TOKEN_OPTIONS.map(
  (token) => token.mint,
);

export const formatMintAddress = (mint: string) =>
  `${mint.slice(0, 4)}…${mint.slice(-4)}`;
