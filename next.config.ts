import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Disable TypeScript checks during builds (optional)
    ignoreBuildErrors: true,
  },

  // Performance optimizations
  serverExternalPackages: ['cloudinary'],

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'recharts',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-label',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@supabase/supabase-js',
      'qrcode.react',
      'jsqr',
      'date-fns',
      'firebase',
      'firebase/firestore',
      'firebase/auth',
    ],
    // Faster builds in development
    serverActions: {
      bodySizeLimit: '10mb',
      // allowedOrigins: [
      //   '8g4fmnb9-3000.inc1.devtunnels.ms',
      //   'https://8g4fmnb9-3000.inc1.devtunnels.ms',
      //   'localhost:3000',
      //   'http://localhost:3000'
      // ]
    },

    // Note: optimizeCss can cause issues with Turbopack, disable for dev
    // optimizeCss: true,
    // Optimize font loading
    optimizeServerReact: true,
  },

  // Turbopack configuration (moved from experimental.turbo)
  turbopack: {
    root: __dirname, // Explicitly set the project root to fix multiple lockfile warning
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Development optimizations
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      };
      // Enable filesystem caching for faster incremental builds
      config.cache = {
        type: 'filesystem',
        version: '1.0.0',
        cacheDirectory: require('path').resolve('.next/cache/webpack'),
      };
    } else if (!isServer) {
      // Production optimizations
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },

  // Configure external image domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/**',
      },
    ],
    // Image optimization settings - prioritize quality
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Disable automatic optimization for Cloudinary URLs to preserve quality
    unoptimized: false,
    loader: 'default',
    // Configure image qualities for Next.js 16 compatibility
    qualities: [25, 50, 75, 90, 100],
  },

  // Add headers for security, mobile compatibility, and Razorpay
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';

    return [
      {
        source: '/:path*',
        headers: [
          // HSTS: Force HTTPS in production
          ...(isProduction ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          }] : []),
          // COOP header set to allow Firebase Auth popups
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
          // CSP headers for Firebase Auth, Razorpay, and mobile compatibility
          // Note: 'unsafe-inline' and 'unsafe-eval' required by Firebase/Razorpay SDKs
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: Firebase, Razorpay, Google APIs, Vercel Feedback
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://apis.google.com https://www.gstatic.com https://vercel.live https://*.vercel.live",
              // Styles: Allow all for Firebase UI
              "style-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://fonts.googleapis.com https://vercel.live https://*.vercel.live",
              // Images: Cloudinary, Google, Razorpay, Dicebear avatars
              "img-src 'self' data: blob: https: https://res.cloudinary.com https://lh3.googleusercontent.com https://api.dicebear.com https://checkout.razorpay.com https://www.google.com https://vercel.live https://*.vercel.live",
              // Fonts: Google Fonts, Razorpay
              "font-src 'self' data: https://checkout.razorpay.com https://fonts.gstatic.com https://vercel.live https://*.vercel.live",
              // Connect: Firebase, Razorpay, Supabase, Google, Cloudinary, Vercel - restrict to specific domains in production
              isProduction
                ? "connect-src 'self' https://*.razorpay.com https://api.razorpay.com wss://*.supabase.co https://*.supabase.co https://*.supabase.in https://firestore.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.googleapis.com https://apis.google.com https://accounts.google.com https://www.google.com https://api.cloudinary.com https://*.cloudinary.com https://vercel.live https://*.vercel.live"
                : "connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.razorpay.com https://api.razorpay.com wss://*.supabase.co https://*.supabase.co https://*.supabase.in https://firestore.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.googleapis.com https://apis.google.com https://accounts.google.com https://www.google.com https://api.cloudinary.com https://*.cloudinary.com https://vercel.live https://*.vercel.live",
              // Frames: Google OAuth, Razorpay checkout, Vercel
              "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com https://*.firebaseapp.com https://vercel.live https://*.vercel.live",
              // Media: Allow videos from ALL Supabase subdomains
              "media-src 'self' blob: data: https://*.supabase.co https://*.supabase.in",
              "base-uri 'self'",
              // Form action: Allow Google OAuth and Razorpay
              "form-action 'self' https://api.razorpay.com https://accounts.google.com",
              // Block object embedding
              "object-src 'none'",
              // Upgrade insecure requests in production
              ...(isProduction ? ["upgrade-insecure-requests"] : []),
            ].join('; '),
          },
          // Security headers
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions Policy - restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self), payment=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
