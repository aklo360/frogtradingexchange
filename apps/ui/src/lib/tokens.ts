export type TokenOption = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
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
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
  },
  {
    mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    symbol: "ORCA",
    name: "Orca",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
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
