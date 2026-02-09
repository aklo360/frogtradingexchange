import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security middleware for Next.js
 * Adds security headers to all responses
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Prevent clickjacking attacks
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Enable XSS protection in older browsers
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Control referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Enforce HTTPS (only in production)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Content Security Policy
  // Allows Solana wallet adapters, external images, and necessary scripts
  const csp = [
    "default-src 'self'",
    // Allow scripts from self, inline (needed for Next.js), and eval for WASM
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    // Allow styles from self and inline (needed for CSS-in-JS)
    "style-src 'self' 'unsafe-inline'",
    // Allow images from self, data URIs, and HTTPS sources (NFT metadata)
    "img-src 'self' data: https: blob:",
    // Allow fonts from self
    "font-src 'self' data:",
    // Allow connections to necessary APIs
    "connect-src 'self' https: wss:",
    // Allow media from self and HTTPS
    "media-src 'self' https: blob:",
    // Prevent embedding in frames
    "frame-ancestors 'none'",
    // Block object/embed/applet
    "object-src 'none'",
    // Restrict base URI
    "base-uri 'self'",
    // Restrict form actions
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  // Permissions Policy - restrict browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  return response;
}

// Apply middleware to all routes except static files and API routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
