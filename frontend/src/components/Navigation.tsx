"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
export default function Navigation() {
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isActive = (path: string) => pathname === path;

    const linkStyle = (path: string) => `
    text-sm font-medium transition-colors duration-200
    ${isActive(path) ? "text-[color:var(--color-forest)] font-semibold" : "text-[color:var(--color-muted)] hover:text-[color:var(--color-forest)]"}
  `;

    return (
        <header className="fixed top-0 inset-x-0 z-50 bg-[color:var(--color-cream)]/80 backdrop-blur-md border-b border-[color:var(--color-border)]">
            <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3 group">
                    <Image
                        src="/logo-color.svg"
                        alt="Loku Caters leaf logo"
                        width={44}
                        height={44}
                        className="rounded-xl transition-transform duration-300 group-hover:scale-105"
                    />
                    <div>
                        <span
                            className="text-xl font-bold tracking-tight block flex items-center gap-1"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            <span style={{ color: "var(--color-forest)" }}>Loku </span>
                            <span style={{ color: "var(--color-sage)" }}>Caters</span>
                        </span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <Link href="/menu" className={linkStyle("/menu")}>Menu</Link>
                    <Link href="/about" className={linkStyle("/about")}>About Us</Link>
                    <Link href="/contact" className={linkStyle("/contact")}>Contact Us</Link>
                    <Link href="/catering-request" className={linkStyle("/catering-request")}>Catering Request</Link>
                    <Link
                        href="/orders"
                        className="bg-[#F2AF29] text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-[color:var(--color-forest)] transition-colors duration-200 shadow-md transform hover:-translate-y-0.5"
                    >
                        Order Now
                    </Link>
                </nav>

                {/* Mobile Nav Toggle */}
                <button
                    className="md:hidden text-[color:var(--color-forest)] p-2 -mr-2"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle menu"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {isMenuOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </>
                        ) : (
                            <>
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </>
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile Nav Menu */}
            {isMenuOpen && (
                <div className="md:hidden absolute top-20 inset-x-0 bg-[color:var(--color-cream)] border-b border-[color:var(--color-border)] shadow-lg animate-slide-up">
                    <nav className="flex flex-col p-6 gap-6">
                        <Link href="/menu" className={linkStyle("/menu")} onClick={() => setIsMenuOpen(false)}>Menu</Link>
                        <Link href="/about" className={linkStyle("/about")} onClick={() => setIsMenuOpen(false)}>About Us</Link>
                        <Link href="/contact" className={linkStyle("/contact")} onClick={() => setIsMenuOpen(false)}>Contact Us</Link>
                        <Link href="/catering-request" className={linkStyle("/catering-request")} onClick={() => setIsMenuOpen(false)}>Catering Request</Link>
                        <Link
                            href="/orders"
                            className="bg-[#F2AF29] text-white px-5 py-3 rounded-xl text-center font-bold mt-2"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Order Now
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}
