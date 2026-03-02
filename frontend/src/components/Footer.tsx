import Link from "next/link";
import Image from "next/image";

export default function Footer() {
    return (
        <footer className="w-full bg-[color:var(--color-forest)] text-[color:var(--color-cream)] py-16 px-6 mt-auto">
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">

                {/* Brand Column */}
                <div className="md:col-span-2">
                    <Link href="/" className="flex items-center gap-3 mb-6 inline-flex">
                        <div className="bg-white p-1 rounded-xl">
                            <Image
                                src="/logo-color.svg"
                                alt="Loku Caters leaf logo"
                                width={36}
                                height={36}
                                className="rounded-lg"
                            />
                        </div>
                        <span
                            className="text-xl font-bold tracking-tight"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Loku Caters
                        </span>
                    </Link>
                    <p className="text-sm leading-relaxed opacity-80 max-w-sm mb-6">
                        Authentic Sri Lankan Cuisine carefully prepared in small batches.
                        We bring the vibrant, rich flavors of our heritage to your table.
                    </p>
                    <div className="flex gap-4">
                        {/* Social Icons (Placeholders) */}
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                            <span className="sr-only">Instagram</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                            </svg>
                        </a>
                        <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                            <span className="sr-only">Facebook</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                            </svg>
                        </a>
                    </div>
                </div>

                {/* Quick Links Column */}
                <div>
                    <h3 className="text-sm font-semibold tracking-wider uppercase mb-5" style={{ color: "var(--color-accent)" }}>
                        Explore
                    </h3>
                    <ul className="flex flex-col gap-3">
                        <li><Link href="/" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Home</Link></li>
                        <li><Link href="/menu" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Our Menu</Link></li>
                        <li><Link href="/about" className="text-sm opacity-80 hover:opacity-100 transition-opacity">About Us</Link></li>
                        <li><Link href="/orders" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Live Orders</Link></li>
                    </ul>
                </div>

                {/* Contact Column */}
                <div>
                    <h3 className="text-sm font-semibold tracking-wider uppercase mb-5" style={{ color: "var(--color-accent)" }}>
                        Get in Touch
                    </h3>
                    <ul className="flex flex-col gap-3">
                        <li><Link href="/catering-request" className="text-sm opacity-80 hover:opacity-100 transition-opacity flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                            Catering Request
                        </Link></li>
                        <li><Link href="/contact" className="text-sm opacity-80 hover:opacity-100 transition-opacity flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                            Contact Us
                        </Link></li>
                    </ul>
                </div>

            </div>

            <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-xs opacity-60">
                    © {new Date().getFullYear()} Loku Caters. All rights reserved.
                </p>
                <p className="text-xs opacity-60">
                    Made in Toronto with ♥
                </p>
            </div>
        </footer>
    );
}
