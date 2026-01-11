"use client";

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AdminSidebar from '@/components/AdminSidebar';
import ModeratorSidebar from '@/components/ModeratorSidebar';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState, createContext, useContext, useCallback } from 'react';

import { SystemConfigProvider } from '@/contexts/SystemConfigContext';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => { },
  mobileOpen: false,
  setMobileOpen: () => { },
});

export const useSidebar = () => useContext(SidebarContext);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, userData } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Determine if we're on landing page
  const isLandingPage = pathname === '/';

  // Determine if we're on login page
  const isLoginPage = pathname === '/login';

  // Determine if we're in admin area
  const isAdminArea = pathname?.startsWith('/admin');

  // Determine if we're in moderator area
  const isModeratorArea = pathname?.startsWith('/moderator');

  // Determine if we're on apply form page (has custom navbar)
  const isApplyFormPage = pathname?.startsWith('/apply/form');

  // Determine if we're on terms and conditions page (has custom layout)
  const isTermsPage = pathname === '/terms-and-conditions';

  // Determine if we're on privacy policy page (has custom layout)
  const isPrivacyPage = pathname === '/privacy-policy';

  // Hide navbar/footer on landing page, login page, apply form page, terms page, and privacy page
  // Show navbar for all authenticated users (including those needing application)
  // This ensures navbar is always visible for logged-in users
  const showNavAndFooter = !isLandingPage && !isLoginPage && !isApplyFormPage && !isTermsPage && !isPrivacyPage && currentUser;

  // Show sidebar for admin/moderator
  const showSidebar = (isAdminArea || isModeratorArea) && currentUser && userData;

  // Handle mobile menu toggle
  const handleMenuToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <SystemConfigProvider>
      <TooltipProvider delayDuration={0}>
        <SidebarContext.Provider value={{
          collapsed: sidebarCollapsed,
          setCollapsed: setSidebarCollapsed,
          mobileOpen,
          setMobileOpen
        }}>
          <div className="app-shell">
            {showNavAndFooter && (
              <div id="app-navbar">
                <Navbar
                  onMenuToggle={handleMenuToggle}
                  isSidebarOpen={mobileOpen}
                />
              </div>
            )}

            {showSidebar ? (
              // Grid layout for admin/moderator with sidebar
              <>
                <div
                  className="admin-layout bg-theme-bg"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: sidebarCollapsed
                      ? 'var(--sidebar-width-collapsed) 1fr'
                      : 'var(--sidebar-width-expanded) 1fr',
                    gridTemplateRows: '1fr auto',
                    minHeight: 'calc(100vh - 48px)', // Subtract navbar height
                    transition: 'grid-template-columns 300ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                  }}
                >
                  {/* Sidebar Column - Hidden on mobile (shown via drawer) */}
                  <div
                    className="hidden md:block"
                    style={{
                      gridColumn: 1,
                      gridRow: '1 / 3',
                      position: 'sticky',
                      top: '48px', // Account for fixed navbar
                      height: 'calc(100vh - 48px)',
                      overflow: 'auto',
                      zIndex: 50
                    }}
                  >
                    {isAdminArea ? <AdminSidebar /> : <ModeratorSidebar />}
                  </div>

                  {/* Main Content Column */}
                  <main
                    className="main-content"
                    style={{
                      gridColumn: 2,
                      gridRow: 1,
                      paddingTop: (pathname === '/admin' || pathname === '/moderator') ? '0' : 'clamp(1rem, 3vw, 2rem)',
                      paddingRight: (pathname === '/admin' || pathname === '/moderator') ? '0' : 'clamp(1rem, 3vw, 2rem)',
                      paddingLeft: (pathname === '/admin' || pathname === '/moderator') ? '0' : 'clamp(1rem, 3vw, 2rem)',
                      paddingBottom: (pathname === '/admin' || pathname === '/moderator') ? '0' : '2rem'
                    }}
                  >
                    {children}
                  </main>

                  {/* Footer in Main Content Column */}
                  {showNavAndFooter && (
                    <div id="app-footer" style={{ gridColumn: 2, gridRow: 2 }}>
                      <Footer />
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Standard layout without sidebar
              <>
                <main className="flex-grow flex flex-col min-h-[calc(100vh-64px)]">
                  {children}
                </main>
                {showNavAndFooter && (
                  <div id="app-footer">
                    <Footer />
                  </div>
                )}
              </>
            )}

            {/* PWA Install Prompt - Only shows on landing page */}
            <PWAInstallPrompt />

            <style jsx global>{`
          :root {
            --sidebar-width-expanded: 220px;
            --sidebar-width-collapsed: 64px;
          }

          .app-shell {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }

          /* Mobile: Hide desktop sidebar grid column */
          @media (max-width: 767px) {
            .admin-layout {
              grid-template-columns: 1fr !important;
            }
            .admin-layout > *:first-child:not(.main-content) {
              display: none !important;
            }
            .main-content {
              grid-column: 1 !important;
            }
            #app-footer {
              grid-column: 1 !important;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .admin-layout {
              transition: none !important;
            }
            .sidebar-drawer {
              transition: none !important;
            }
          }

          /* Smooth transitions for content when sidebar collapses */
          .main-content {
            transition: padding 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
          }

          /* Hide navbar when blocking overlay is active */
          body.block-overlay #app-navbar { display: none !important; }
          body.block-overlay #app-footer { display: none !important; }
        `}</style>
          </div>
        </SidebarContext.Provider>
      </TooltipProvider>
    </SystemConfigProvider>
  );
}


