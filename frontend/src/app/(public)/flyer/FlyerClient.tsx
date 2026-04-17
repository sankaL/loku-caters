"use client";

import Image from "next/image";
import Link from "next/link";
import EVENT_CONFIG from "@/config/event-config.json";

/* ───────────────────── flyer data ───────────────────── */

interface Variety {
    name: string;
    price: number;
}

interface AppetizerItem {
    name: string;
    image: string;
    imagePosition?: string;
    minOrder: number;
    varieties: Variety[];
}

interface TrayItem {
    name: string;
    image: string;
    size: string;
    price: number;
}

const appetizers = EVENT_CONFIG.flyer.appetizers as AppetizerItem[];
const trays = EVENT_CONFIG.flyer.trays as TrayItem[];

/* ───────────────────── format helpers ───────────────────── */

function formatPrice(price: number): string {
    return price % 1 === 0
        ? `$${price}`
        : `$${price.toFixed(2)}`;
}

/* ───────────────────── components ───────────────────── */

function AppetizerCard({
    item,
    index,
}: {
    item: AppetizerItem;
    index: number;
}) {
    return (
        <div
            className="group bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 animate-fade-up"
            style={{ animationDelay: `${index * 100}ms` }}
        >
            {/* Image */}
            <div className="relative w-full h-52 md:h-60 overflow-hidden">
                <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    style={item.imagePosition ? { objectPosition: item.imagePosition } : undefined}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                {/* Min order badge */}
                <span className="absolute top-3 right-3 bg-[color:var(--color-forest)]/90 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
                    </svg>
                    Min. {item.minOrder} pcs
                </span>

                {/* Item name overlay */}
                <div className="absolute bottom-3 left-4">
                    <h3
                        className="text-white text-2xl font-bold drop-shadow-lg"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        {item.name}
                    </h3>
                </div>
            </div>

            {/* Varieties pricing table */}
            <div className="p-5 md:p-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-sage)] font-bold mb-3">
                    Price per unit
                </p>
                <div className="space-y-0">
                    {item.varieties.map((v, idx) => (
                        <div
                            key={v.name}
                            className={`flex items-center justify-between py-2.5 ${
                                idx < item.varieties.length - 1
                                    ? "border-b border-[color:var(--color-border)]/60"
                                    : ""
                            }`}
                        >
                            <span className="text-sm text-[color:var(--color-text)] font-medium">
                                {v.name}
                            </span>
                            <span className="text-sm font-bold text-[color:var(--color-forest)] tabular-nums">
                                {formatPrice(v.price)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function TrayCard({ item, index }: { item: TrayItem; index: number }) {
    return (
        <div
            className="group relative bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 animate-fade-up"
            style={{ animationDelay: `${index * 100}ms` }}
        >
            {/* Image */}
            <div className="relative w-full h-48 md:h-56 overflow-hidden">
                <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                {/* Price badge */}
                <span className="absolute top-3 right-3 bg-[#8B5E3C] text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                    {formatPrice(item.price)}
                </span>

                {/* Name + size overlay */}
                <div className="absolute bottom-3 left-4 right-4">
                    <h3
                        className="text-white text-xl font-bold drop-shadow-lg"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        {item.name}
                    </h3>
                    <p className="text-white/75 text-xs font-medium mt-0.5">
                        {item.size}
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ───────────────────── main page ───────────────────── */

export default function FlyerClient() {
    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Hero Banner */}
            <section className="relative overflow-hidden bg-[color:var(--color-forest)] text-white pt-16 pb-20 px-6">
                {/* Decorative background pattern */}
                <div className="absolute inset-0 opacity-[0.06]">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                            backgroundSize: "32px 32px",
                        }}
                    />
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-[color:var(--color-sage)]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-[color:var(--color-accent)]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

                <div className="relative max-w-4xl mx-auto text-center animate-fade-up">
                    <span className="inline-block text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-accent)] font-bold mb-4">
                        Current Offerings
                    </span>
                    <h1
                        className="text-4xl md:text-6xl font-bold mb-5"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        Catering Flyer
                    </h1>
                    <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
                        Our latest selection of appetizers and tray offerings,
                        freshly prepared with authentic Sri Lankan flavors.
                        Prices and items are updated regularly.
                    </p>
                </div>
            </section>

            {/* Content */}
            <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
                {/* Appetizers Section */}
                <section className="mb-20">
                    <div className="flex items-center gap-4 mb-10 animate-fade-up">
                        <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                        <div className="text-center">
                            <span className="block text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-sage)] font-bold mb-1">
                                Per Piece
                            </span>
                            <h2
                                className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                                style={{ fontFamily: "var(--font-serif)" }}
                            >
                                Appetizers
                            </h2>
                        </div>
                        <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                        {appetizers.map((item, idx) => (
                            <AppetizerCard
                                key={item.name}
                                item={item}
                                index={idx}
                            />
                        ))}
                    </div>
                </section>

                {/* Trays Section */}
                <section className="mb-20">
                    <div className="flex items-center gap-4 mb-10 animate-fade-up">
                        <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                        <div className="text-center">
                            <span className="block text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-sage)] font-bold mb-1">
                                Half Trays
                            </span>
                            <h2
                                className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                                style={{ fontFamily: "var(--font-serif)" }}
                            >
                                Trays
                            </h2>
                        </div>
                        <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {trays.map((item, idx) => (
                            <TrayCard
                                key={item.name}
                                item={item}
                                index={idx}
                            />
                        ))}
                    </div>
                </section>
            </div>

            {/* CTA footer */}
            <section className="bg-[color:var(--color-cream-dark)] py-20 px-6">
                <div className="max-w-3xl mx-auto text-center animate-fade-up">
                    <h2
                        className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-5"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        Ready to place an order?
                    </h2>
                    <p className="text-base text-[color:var(--color-muted)] mb-8 max-w-xl mx-auto">
                        Get in touch with us to order any of these items, or
                        request a custom catering menu for your next event.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/catering-request"
                            className="inline-block bg-[color:var(--color-sage)] text-white px-8 py-3.5 rounded-full font-bold text-base hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                        >
                            Request Catering
                        </Link>
                        <Link
                            href="/contact"
                            className="inline-flex items-center gap-2 text-[color:var(--color-sage)] font-semibold hover:text-[color:var(--color-forest)] transition-colors text-base"
                        >
                            Contact Us
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M5 12h14" />
                                <path d="m12 5 7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}
