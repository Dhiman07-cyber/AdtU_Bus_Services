import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Disable TypeScript checks during builds (optional)
    ignoreBuildErrors: true,
  },

  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'recharts',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      'qrcode.react',
      'jsqr'
    ],
    // Faster builds in development
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Enable faster refresh
    optimizeCss: true,
    // Optimize font loading
    optimizeServerReact: true,
  },

  // Turbopack configuration (moved from experimental.turbo)
  turbopack: {
    root: process.cwd(), // Use absolute path
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
      // Reduce memory usage in development
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
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

  // Add headers for mobile compatibility and Razorpay
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: Firebase, Razorpay, Google APIs
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://apis.google.com https://www.gstatic.com",
              // Styles: Allow all for Firebase UI
              "style-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://fonts.googleapis.com",
              // Images: Cloudinary, Google, Razorpay, Dicebear avatars
              "img-src 'self' data: blob: https: https://res.cloudinary.com https://lh3.googleusercontent.com https://api.dicebear.com https://checkout.razorpay.com https://www.google.com",
              // Fonts: Google Fonts, Razorpay
              "font-src 'self' data: https://checkout.razorpay.com https://fonts.gstatic.com",
              // Connect: Firebase, Razorpay, Supabase, Google (for ping), Localhost (for Firebase Emulator)
              "connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.razorpay.com https://api.razorpay.com wss://*.supabase.co https://*.supabase.co https://firestore.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.googleapis.com https://apis.google.com https://accounts.google.com https://www.google.com",
              // Frames: Google OAuth, Razorpay checkout
              "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com https://*.firebaseapp.com",
              "base-uri 'self'",
              // Form action: Allow Google OAuth and Razorpay
              "form-action 'self' https://api.razorpay.com https://accounts.google.com",
            ].join('; '),
          },
          // Mobile-specific headers
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
