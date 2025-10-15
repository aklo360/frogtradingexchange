"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import type { TokenOption } from "@/lib/tokens";
import {
  DEFAULT_TOKEN_MAP,
  DEFAULT_TOKEN_OPTIONS,
  TRENDING_TOKEN_MINTS,
  formatMintAddress,
} from "@/lib/tokens";
import styles from "./SwapCard.module.css";

const API_BASE = "https://lite-api.jup.ag/tokens/v2";
const SUGGESTED_LIMIT = 12;
const SEARCH_LIMIT = 200;

type JupiterToken = {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  logoURI?: string;
  decimals?: number;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
};

const convertToken = (token: JupiterToken): TokenOption => ({
  mint: token.id,
  symbol: token.symbol ?? formatMintAddress(token.id),
  name: token.name ?? token.symbol ?? formatMintAddress(token.id),
  decimals: typeof token.decimals === "number" ? token.decimals : 0,
  logoURI: token.icon ?? token.logoURI ?? undefined,
  isVerified: Boolean(token.isVerified || token.tags?.includes("verified")),
  tags: token.tags ?? [],
  organicScore: typeof token.organicScore === "number" ? token.organicScore : undefined,
});

const mergeTokens = (base: TokenOption[], extras: TokenOption[]) => {
  const map = new Map(base.map((token) => [token.mint, token]));
  for (const token of extras) {
    const existing = map.get(token.mint);
    if (!existing) {
      map.set(token.mint, token);
      continue;
    }
    map.set(token.mint, {
      ...existing,
      ...token,
      logoURI: token.logoURI ?? existing.logoURI,
      isVerified: existing.isVerified || token.isVerified,
      tags: token.tags?.length ? token.tags : existing.tags,
      organicScore:
        token.organicScore !== undefined
          ? token.organicScore
          : existing.organicScore,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" }),
  );
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

let verifiedCache: TokenOption[] | null = null;
let verifiedPromise: Promise<TokenOption[]> | null = null;

const loadVerifiedTokens = () => {
  if (verifiedCache) return Promise.resolve(verifiedCache);
  if (!verifiedPromise) {
    verifiedPromise = fetchJson<JupiterToken[]>(`${API_BASE}/tag?query=verified`)
      .then((tokens) => tokens.map(convertToken))
      .then((tokens) => {
        verifiedCache = tokens;
        return tokens;
      })
      .finally(() => {
        verifiedPromise = null;
      });
  }
  return verifiedPromise;
};

let trendingCache: TokenOption[] | null = null;
let trendingPromise: Promise<TokenOption[]> | null = null;

const loadTrendingTokens = () => {
  if (trendingCache) return Promise.resolve(trendingCache);
  if (!trendingPromise) {
    trendingPromise = fetchJson<JupiterToken[]>(
      `${API_BASE}/toporganicscore/5m?limit=50`,
    )
      .then((tokens) => tokens.map(convertToken))
      .then((tokens) => {
        trendingCache = tokens;
        return tokens;
      })
      .finally(() => {
        trendingPromise = null;
      });
  }
  return trendingPromise;
};

const searchCache = new Map<string, TokenOption[]>();

const searchTokens = async (query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  if (searchCache.has(normalized)) {
    return searchCache.get(normalized)!;
  }
  const results = await fetchJson<JupiterToken[]>(
    `${API_BASE}/search?query=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
  );
  const converted = results.map(convertToken);
  searchCache.set(normalized, converted);
  return converted;
};

const isValidMintAddress = (value: string) => {
  try {
    new PublicKey(value);
    return value.length >= 32 && value.length <= 44;
  } catch {
    return false;
  }
};

const buildSuggestedList = (candidates: TokenOption[]) => {
  const featuredTokens = DEFAULT_TOKEN_OPTIONS.filter((token) => token.featured);
  const seen = new Set<string>();
  const ordered: TokenOption[] = [];

  const maxPrimary = Math.max(
    0,
    SUGGESTED_LIMIT -
      featuredTokens.filter((token) => !seen.has(token.mint)).length,
  );

  for (const token of candidates) {
    if (token.featured) continue;
    if (seen.has(token.mint)) continue;
    ordered.push(token);
    seen.add(token.mint);
    if (ordered.length >= maxPrimary) break;
  }

  for (const token of featuredTokens) {
    if (seen.has(token.mint)) continue;
    ordered.push(token);
    seen.add(token.mint);
  }

  if (ordered.length < SUGGESTED_LIMIT) {
    for (const token of candidates) {
      if (seen.has(token.mint)) continue;
      ordered.push(token);
      seen.add(token.mint);
      if (ordered.length >= SUGGESTED_LIMIT) break;
    }
  }

  return ordered.slice(0, SUGGESTED_LIMIT);
};

type TokenSelectorProps = {
  id: string;
  label: string;
  selectedToken: TokenOption;
  onSelect: (token: TokenOption) => void;
  disallowMint?: string;
};

export const TokenSelector = ({
  id,
  label,
  selectedToken,
  onSelect,
  disallowMint,
}: TokenSelectorProps) => {
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmedQuery = search.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseTokens, setBaseTokens] = useState<TokenOption[]>(() => [
    ...DEFAULT_TOKEN_OPTIONS,
  ]);
  const [suggestedTokens, setSuggestedTokens] = useState<TokenOption[]>(() =>
    buildSuggestedList(
      TRENDING_TOKEN_MINTS.map((mint) => DEFAULT_TOKEN_MAP.get(mint)!),
    ),
  );
  const [searchResults, setSearchResults] = useState<TokenOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const tokenMap = useMemo(
    () => new Map(baseTokens.map((token) => [token.mint, token])),
    [baseTokens],
  );

  const isMintQuery = isValidMintAddress(trimmedQuery);

  const tokensToDisplay = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return searchResults.slice(0, 200);
  }, [normalizedQuery, searchResults]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let encounteredError: string | null = null;

    setLoading(true);
    setError(null);

    const hydrate = async () => {
      const [verified, trending] = await Promise.all([
        loadVerifiedTokens().catch((err) => {
          encounteredError =
            (err as Error).message ?? "Failed to load verified tokens";
          return [] as TokenOption[];
        }),
        loadTrendingTokens().catch((err) => {
          encounteredError =
            encounteredError ??
            ((err as Error).message ?? "Failed to load trending tokens");
          return [] as TokenOption[];
        }),
      ]);

      if (cancelled) return;

      if (verified.length) {
        setBaseTokens((prev) => mergeTokens(prev, verified));
      }

        if (trending.length) {
          setBaseTokens((prev) => mergeTokens(prev, trending));
          const trendingFiltered = trending
            .filter(
              (token) =>
                (token.isVerified || token.tags?.includes("verified")) &&
                (token.organicScore ?? 0) >= 93,
            )
            .sort(
              (a, b) => (b.organicScore ?? 0) - (a.organicScore ?? 0),
            );
          if (trendingFiltered.length) {
            setSuggestedTokens(buildSuggestedList(trendingFiltered));
          }
        }
    };

    const request = hydrate();
    request.finally(() => {
      if (!cancelled) {
        if (encounteredError) {
          setError(encounteredError);
        }
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      setCustomError(null);
      return;
    }

    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void searchTokens(trimmedQuery)
        .then((results) => {
          if (cancelled) return;
          setSearchResults(results);
          if (results.length) {
            setBaseTokens((prev) => mergeTokens(prev, results));
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSearchError((err as Error).message ?? "Search failed");
          setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, open, trimmedQuery]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelect = useCallback(
    (token: TokenOption) => {
      if (token.mint === disallowMint) {
        return;
      }
      onSelect(tokenMap.get(token.mint) ?? token);
      closeModal();
    },
    [closeModal, disallowMint, onSelect, tokenMap],
  );

  const loadCustomToken = useCallback(async () => {
    const mint = search.trim();
    if (!isValidMintAddress(mint)) {
      setCustomError("Enter a valid mint address");
      return;
    }

    setCustomLoading(true);
    setCustomError(null);

    try {
      const cached = tokenMap.get(mint) ?? DEFAULT_TOKEN_MAP.get(mint);
      if (cached) {
        handleSelect(cached);
        return;
      }

      const accountInfo = await connection.getParsedAccountInfo(
        new PublicKey(mint),
        "confirmed",
      );

      const decimals =
        (accountInfo.value?.data as { parsed?: { info?: { decimals?: number } } })
          ?.parsed?.info?.decimals;

      if (typeof decimals !== "number") {
        throw new Error("Mint account missing decimals");
      }

      const option: TokenOption = {
        mint,
        symbol: formatMintAddress(mint),
        name: "Custom token",
        decimals,
      };

      setBaseTokens((prev) => mergeTokens(prev, [option]));
      handleSelect(option);
    } catch (err) {
      setCustomError((err as Error).message ?? "Unable to load token");
    } finally {
      setCustomLoading(false);
    }
  }, [connection, handleSelect, search, tokenMap]);

  const modal = open
    ? createPortal(
        <div
          className={styles.tokenModalOverlay}
          role="presentation"
          onClick={closeModal}
        >
          <div
            className={styles.tokenModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.tokenModalHeader}>
              <h2 id={`${id}-title`} className={styles.tokenModalTitle}>
                Select a token
              </h2>
              <button
                type="button"
                className={styles.tokenModalClose}
                onClick={closeModal}
                aria-label="Close token selector"
              >
                ×
              </button>
            </header>
            <div className={styles.tokenSearchRow}>
              <label htmlFor={`${id}-search`} className={styles.srOnly}>
                Search tokens
              </label>
              <input
                id={`${id}-search`}
                className={styles.tokenSearchInput}
                placeholder="Search by symbol or mint"
                autoFocus
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCustomError(null);
                }}
              />
            </div>

            <div className={styles.tokenModalBody}>
              {loading && (
                <div className={styles.tokenStatus}>Loading verified list…</div>
              )}
              {error && !loading && (
                <div className={styles.tokenError}>{error}</div>
              )}
              {searchLoading && (
                <div className={styles.tokenStatus}>Searching…</div>
              )}
              {searchError && !searchLoading && (
                <div className={styles.tokenError}>{searchError}</div>
              )}

              <section className={styles.tokenSection} aria-label="Suggested tokens">
                <h3 className={styles.tokenSectionTitle}>Suggested</h3>
                <ul className={styles.tokenList}>
                  {suggestedTokens.map((token) => (
                    <li key={token.mint}>
                      <button
                        type="button"
                        className={[
                          styles.tokenListItem,
                          token.mint === selectedToken.mint
                            ? styles.tokenListItemActive
                            : "",
                          token.mint === disallowMint
                            ? styles.tokenListItemDisabled
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleSelect(token)}
                        disabled={token.mint === disallowMint}
                      >
                        <TokenBadge token={token} />
                        <div className={styles.tokenMeta}>
                          <span className={styles.tokenSymbol}>
                            {token.symbol}
                            {token.isVerified && (
                              <span
                                className={styles.tokenVerified}
                                aria-label="Verified token"
                              >
                                ✓
                              </span>
                            )}
                          </span>
                          <span className={styles.tokenMint}>
                            {formatMintAddress(token.mint)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.tokenSection} aria-label="Token results">
                <h3 className={styles.tokenSectionTitle}>Search results</h3>
                <ul className={styles.tokenList}>
                  {tokensToDisplay.map((token) => (
                    <li key={token.mint}>
                      <button
                        type="button"
                        className={[
                          styles.tokenListItem,
                          token.mint === selectedToken.mint
                            ? styles.tokenListItemActive
                            : "",
                          token.mint === disallowMint
                            ? styles.tokenListItemDisabled
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleSelect(token)}
                        disabled={token.mint === disallowMint}
                      >
                        <TokenBadge token={token} />
                        <div className={styles.tokenMeta}>
                          <span className={styles.tokenSymbol}>
                            {token.symbol}
                            {token.isVerified && (
                              <span
                                className={styles.tokenVerified}
                                aria-label="Verified token"
                              >
                                ✓
                              </span>
                            )}
                          </span>
                          <span className={styles.tokenName}>{token.name}</span>
                          <span className={styles.tokenMint}>
                            {formatMintAddress(token.mint)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                  {tokensToDisplay.length === 0 && !normalizedQuery && (
                    <li className={styles.tokenEmpty}>Start typing to search the verified list.</li>
                  )}
                  {tokensToDisplay.length === 0 && normalizedQuery && !searchLoading && (
                    <li className={styles.tokenEmpty}>No tokens matched your search.</li>
                  )}
                </ul>
              </section>

              {isMintQuery &&
                !tokenMap.has(trimmedQuery) &&
                !searchLoading && (
                <div className={styles.tokenCustomAction}>
                  <p className={styles.tokenCustomHint}>
                    Paste any Solana mint address to load its metadata.
                  </p>
                  <button
                    type="button"
                    className={styles.tokenCustomButton}
                    onClick={() => void loadCustomToken()}
                    disabled={customLoading}
                  >
                    {customLoading ? "Checking mint…" : "Use this mint"}
                  </button>
                  {customError && (
                    <p className={styles.tokenError}>{customError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <label className={styles.srOnly} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className={styles.tokenSelect}
        onClick={() => setOpen(true)}
        title={`${selectedToken.name} (${formatMintAddress(selectedToken.mint)})`}
      >
        <span className={styles.tokenSelectContent}>
          <TokenBadge token={selectedToken} small />
          <span className={styles.tokenSelectSymbol}>{selectedToken.symbol}</span>
        </span>
        <span className={styles.srOnly}>{formatMintAddress(selectedToken.mint)}</span>
        <svg
          className={styles.tokenSelectChevron}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M6.343 9.172a1 1 0 0 1 1.414 0L12 13.414l4.243-4.242a1 1 0 1 1 1.414 1.414l-4.95 4.95a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414z"
            fill="currentColor"
          />
        </svg>
      </button>
      {modal}
    </>
  );
};

type TokenBadgeProps = {
  token: TokenOption;
  small?: boolean;
};

const TokenBadge = ({ token, small = false }: TokenBadgeProps) => {
  const classNames = [
    styles.tokenLogo,
    small ? styles.tokenLogoSmall : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (token.logoURI) {
    return (
      <img
        className={classNames}
        src={token.logoURI}
        alt={`${token.symbol} logo`}
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <span className={classNames} aria-hidden>
      {token.symbol?.slice(0, 2)?.toUpperCase() ?? "?"}
    </span>
  );
};
