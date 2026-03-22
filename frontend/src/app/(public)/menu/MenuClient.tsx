"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { EventConfig } from "@/config/event";

/* ───────────────────────────── types ───────────────────────────── */

interface MenuItem {
    name: string;
    description: string;
    diet?: string[];
    hasTooltip?: boolean;
}

interface MenuCard {
    title: string;
    image: string;
    items: { label: string; value: string }[];
    note?: string;
}

interface CateringMenu {
    name: string;
    subtitle: string;
    price?: string;
    priceNote?: string;
    image: string;
    cards: MenuCard[];
}

/* ─────────────────────── individual items data ─────────────────── */

const individualItems = {
    title: "Individual Items & Signature Dishes",
    categories: [
        {
            name: "Dishes",
            items: [
                {
                    name: "Lamprais",
                    description:
                        "Wrapped in a banana leaf with Ghee Rice, Baked Chicken Curry, Fried boiled egg, Seeni Sambal, Fricadells (Beef and Pork), Ash Plantain curry, Brinjal Pahie, and Blachan.",
                    diet: ["Signature"],
                    hasTooltip: true,
                },
            ] as MenuItem[],
        },
        {
            name: "Appetizers",
            items: [
                {
                    name: "Fish Cutlets",
                    description:
                        "Spiced fish and potato croquettes, breaded and fried golden.",
                },
                {
                    name: "Mutton Roll",
                    description:
                        "Crispy fried rolls filled with savoury spiced mutton.",
                },
                {
                    name: "Fish Roll",
                    description:
                        "Crispy fried rolls filled with spiced fish and herbs.",
                },
                {
                    name: "Fish Pastries",
                    description:
                        "Delicate golden pastries stuffed with a fragrant fish filling.",
                },
            ] as MenuItem[],
        },
    ],
};

/* ─────────────────────── catering menus data ──────────────────── */

const cateringMenus: CateringMenu[] = [
    {
        name: "Standard Menu",
        subtitle: "Classic Sri Lankan catering for every occasion",
        price: "$18",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/standard-menu.png",
        cards: [
            {
                title: "Option 1",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Tempered Yellow Rice" },
                    { label: "Chicken", value: "Chicken Curry" },
                    { label: "Fish", value: "Fish Ambulthiyal" },
                    { label: "Lentils", value: "Dhal Fry" },
                    { label: "Vegetables", value: "Beans, Bringal Moju" },
                    { label: "Sides", value: "Devilled Potato" },
                ],
            },
            {
                title: "Option 2",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Fried Rice" },
                    { label: "Chicken", value: "Chicken Devilled" },
                    { label: "Fish", value: "Fish Curry" },
                    { label: "Sides", value: "Potato Tempered, Cashew" },
                    { label: "Vegetables", value: "Vegetable Chop Suey" },
                    { label: "Condiments", value: "Papadam and Fried Chilli" },
                ],
            },
            {
                title: "Option 3",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Ghee Rice" },
                    { label: "Chicken", value: "Baked Chicken Curry" },
                    { label: "Fish", value: "Devilled Fish" },
                    { label: "Lentils", value: "Dhal Fry" },
                    { label: "Vegetables", value: "Bean Curry, Polos Curry" },
                    { label: "Appetizer", value: "Fish Cutlet" },
                ],
            },
            {
                title: "Option 4",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Tempered Yellow Rice" },
                    { label: "Chicken", value: "Chicken Baked Curry" },
                    { label: "Fish / Pork", value: "Fish or Pork" },
                    {
                        label: "Lentils / Potato",
                        value: "Dhal Fry or Potato White Curry",
                    },
                    {
                        label: "Vegetables",
                        value: "Vegetable Chop Suey or Bean Curry",
                    },
                    { label: "Sides", value: "Cashew Curry, Papadam and Fried Chilli" },
                ],
                note: "Adding Shrimp or Mutton - extra $4.50/person",
            },
        ],
    },
    {
        name: "Buffet Style Menu 1",
        subtitle: "An elegant buffet with curated selections",
        price: "$21.50",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/buffet-1.png",
        cards: [
            {
                title: "Main Spread",
                image: "/assets/food/menu/buffet-1.png",
                items: [
                    { label: "Salad", value: "Garden Salad" },
                    { label: "Rice", value: "Egg Fried Rice" },
                    { label: "Chicken", value: "Chicken Oven Baked Curry" },
                    { label: "Prawn", value: "Spicy Garlic Onion Prawn" },
                    { label: "Vegetables", value: "Green Bean Curry, Brinjal Pahi" },
                    { label: "Condiments", value: "Papadam and Fried Chilli" },
                ],
            },
            {
                title: "Selections & Dessert",
                image: "/assets/food/menu/desserts.png",
                items: [
                    {
                        label: "Choice of one",
                        value: "Dhal Tempered, Potato White Curry, or Cashew Curry",
                    },
                    { label: "Dessert", value: "Cream Caramel" },
                ],
                note: "Additional desserts available: Pineapple Gateau, Marshmallow Pudding, Mango Mousse, Fresh Fruit Salad, or Fresh Fruit Platter",
            },
        ],
    },
    {
        name: "Buffet Style Menu 2",
        subtitle: "A lavish spread with more variety",
        price: "$25.50",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/buffet-2.png",
        cards: [
            {
                title: "Full Menu",
                image: "/assets/food/menu/buffet-2.png",
                items: [
                    { label: "Salads", value: "Garden Salad, Egg Salad" },
                    { label: "Rice", value: "Yellow Rice" },
                    { label: "Chicken", value: "Chicken Oven Baked Curry" },
                    { label: "Prawn", value: "Spicy Garlic Onion Prawn" },
                    { label: "Fish", value: "Fish Curry" },
                    { label: "Sides", value: "Fried Potato, Cashew Curry" },
                    { label: "Pickle", value: "Brinjal Moju" },
                ],
            },
            {
                title: "Desserts",
                image: "/assets/food/menu/desserts.png",
                items: [
                    { label: "Dessert", value: "Cream Caramel" },
                ],
                note: "Additional desserts available: Pineapple Gateau, Marshmallow Pudding, Mango Mousse, Fresh Fruit Salad, or Fresh Fruit Platter",
            },
        ],
    },
    {
        name: "Classic Curry Menu",
        subtitle: "Build your own classic curry experience",
        price: "$30",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/classic-curry.png",
        cards: [
            {
                title: "Salads & Rice",
                image: "/assets/food/menu/classic-curry.png",
                items: [
                    {
                        label: "Salads (select 2)",
                        value: "Garden Salad, Beet Salad, Potato Salad, or Cucumber Onion Yoghurt",
                    },
                    {
                        label: "Rice / Noodles (select 2)",
                        value: "Fried Rice, Yellow Rice, Vegetable Egg Noodle, or Brown Rice",
                    },
                ],
            },
            {
                title: "Proteins",
                image: "/assets/food/menu/classic-curry.png",
                items: [
                    {
                        label: "Chicken (select 1)",
                        value: "Chicken-Devilled, Chicken Stir-fry, or Oven Baked Curry",
                    },
                    {
                        label: "Fish (select 1)",
                        value: "Fish Ambulthiyal, Fish White Curry, Spicy Mustard Fish Curry, or Fish Korma",
                    },
                    {
                        label: "Prawn (select 1)",
                        value: "Garlic Prawn, Prawn Brown Curry, or Prawn Fried",
                    },
                ],
            },
            {
                title: "Vegetables & Desserts",
                image: "/assets/food/menu/desserts.png",
                items: [
                    {
                        label: "Vegetable (select 3)",
                        value: "Dhall Curry, Brinjal Moju, Brinjal Pahi, Mixed Vegetable Curry, Bean Curry, Potato Curry, Potato Tempered, Cauliflower and Potato Masala, Cashew Curry, Cabbage Mallum, Pineapple Curry, Kola Mallum, or Dhal and Spinach Tempered",
                    },
                    { label: "Condiments", value: "Papadam or Pickle" },
                    {
                        label: "Desserts (select 2)",
                        value: "Fruit Platter, Cream Caramel, or Chocolate Pudding",
                    },
                ],
            },
        ],
    },
    {
        name: "International Buffet",
        subtitle: "A fusion of Sri Lankan and international cuisine",
        image: "/assets/food/menu/international-buffet.png",
        cards: [
            {
                title: "Salads & Starches",
                image: "/assets/food/menu/international-buffet.png",
                items: [
                    {
                        label: "Salads (select 2)",
                        value: "Potato Salad, Garden Salad, Beet Salad, Apple Cole Slaw, Cucumber and Tomato Yoghurt, Pasta Salad, or Caesar Salad",
                    },
                    {
                        label: "Rice / Noodles / Pasta (select 2)",
                        value: "Fried Rice, Yellow Rice, Plain Buttered Rice, Fried Noodles, Pasta with Tomato Sauce, Roasted Herb Potato, Lyonnais Potato (with Onion), Penne Pasta with Tomato Sauce, or Spaghetti with Mushroom Sauce",
                    },
                ],
            },
            {
                title: "Proteins",
                image: "/assets/food/menu/international-buffet.png",
                items: [
                    {
                        label: "Chicken (select 1)",
                        value: "Chicken Stir-fry, Chicken with Cashew Nuts, Chicken Red Wine Sauce, Chicken Mushroom Sauce, Chicken Red Curry with Lemon Grass, Chicken Korma, or Chicken Masala",
                    },
                    {
                        label: "Fish (select 1)",
                        value: "Fish with White Wine Sauce, Devilled Fish, Fish Curry, Fish Masala, Fish with Mandarin Sauce, or Sweet and Sour Fish",
                    },
                    {
                        label: "Prawn (select 1)",
                        value: "Prawn Provencal, Teriyaki, Prawn Stir-fry, Prawn with White Wine Sauce, Prawn Kadi, Prawn Curry, Prawn Telata, or Prawn Sweet and Sour",
                    },
                ],
            },
            {
                title: "Vegetables & Desserts",
                image: "/assets/food/menu/desserts.png",
                items: [
                    {
                        label: "Vegetable (select 3)",
                        value: "Garden Vegetable, Buttered Broccoli, Glazed Carrot, Mixed Vegetable Curry, Bean Curry, Vegetable Chop Suey, Polos Maluwa, Cashew Curry, Brinjal Moju, Dhal Tempered, Dhal and Spinach Tempered, Cauliflower and Potato Masala, or Steam Vegetable",
                    },
                    { label: "Condiments", value: "Papadam, Pickle, and Dressing" },
                    {
                        label: "Dessert (select 2)",
                        value: "Fresh Fruit Salad, Cream Caramel, or Chocolate Pudding",
                    },
                ],
            },
        ],
    },
    {
        name: "Set Menu",
        subtitle: "Table d'Hote - fine dining experience",
        image: "/assets/food/menu/set-menu.png",
        cards: [
            {
                title: "Full Course",
                image: "/assets/food/menu/set-menu.png",
                items: [
                    {
                        label: "Salad",
                        value: "Garden Spring Vegetable Salad with Mango Vinaigrette",
                    },
                    {
                        label: "Main (choice of)",
                        value: "Roasted Beef Striploin with Mushroom Sauce or Pepper Sauce, or Oven Baked Salmon Fillet with White Wine Sauce or Caper Butter Sauce",
                    },
                    {
                        label: "Accompaniment (choice of)",
                        value: "Mashed Potato or Herb Roast Potato",
                    },
                    { label: "Vegetable", value: "Buttered Vegetable Medley" },
                    { label: "Dessert", value: "Orange Cream Caramel" },
                ],
            },
        ],
    },
];

/* ─────────────────── catering menu modal component ────────────── */

function CateringMenuModal({
    menu,
    onClose,
}: {
    menu: CateringMenu;
    onClose: () => void;
}) {
    const [currentCard, setCurrentCard] = useState(0);
    const total = menu.cards.length;
    const card = menu.cards[currentCard];

    useEffect(() => {
        setCurrentCard(0);
    }, [menu]);

    const prev = useCallback(
        () => setCurrentCard((c) => (c - 1 + total) % total),
        [total]
    );
    const next = useCallback(
        () => setCurrentCard((c) => (c + 1) % total),
        [total]
    );

    /* keyboard nav */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") prev();
            if (e.key === "ArrowRight") next();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, prev, next]);

    /* lock body scroll */
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* backdrop */}
            <div
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* modal card */}
            <div className="relative w-full max-w-2xl z-10 animate-scale-in">
                {/* close */}
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 z-30 w-10 h-10 bg-[color:var(--color-forest)] hover:bg-[color:var(--color-sage)] text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                    aria-label="Close menu"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {/* card container */}
                <div className="bg-[#1a1a18] rounded-3xl overflow-hidden shadow-2xl border border-[#333]">
                    {/* header image */}
                    <div className="relative w-full h-48 md:h-56">
                        <Image
                            src={card.image}
                            alt={card.title}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a18] via-[#1a1a18]/40 to-transparent" />

                        {/* menu name overlay */}
                        <div className="absolute bottom-4 left-6 right-6">
                            <p className="text-[#c4a96a] text-xs uppercase tracking-[0.2em] font-semibold mb-1">
                                {menu.name}
                            </p>
                            <h3
                                className="text-white text-2xl md:text-3xl font-bold"
                                style={{ fontFamily: "var(--font-serif)" }}
                            >
                                {card.title}
                            </h3>
                        </div>
                    </div>

                    {/* menu items */}
                    <div className="px-6 md:px-8 py-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {/* price badge */}
                        {menu.price && currentCard === 0 && (
                            <div className="flex items-center justify-center mb-6">
                                <span className="inline-flex items-center gap-2 bg-[#c4a96a]/15 border border-[#c4a96a]/30 text-[#c4a96a] px-5 py-2 rounded-full text-sm font-semibold tracking-wide">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h4"/></svg>
                                    {menu.price} {menu.priceNote}
                                </span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {card.items.map((item, idx) => (
                                <div key={idx} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                                    <p className="text-[#c4a96a] text-xs uppercase tracking-[0.15em] font-semibold mb-1.5">
                                        {item.label}
                                    </p>
                                    <p className="text-white/85 text-sm leading-relaxed">
                                        {item.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* note */}
                        {card.note && (
                            <div className="mt-5 pt-4 border-t border-[#c4a96a]/20">
                                <p className="text-[#c4a96a]/70 text-xs italic leading-relaxed text-center">
                                    {card.note}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* navigation footer */}
                    <div className="px-6 md:px-8 pb-5 flex items-center justify-between">
                        {/* left arrow */}
                        <button
                            onClick={prev}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                total <= 1
                                    ? "opacity-0 pointer-events-none"
                                    : "bg-white/10 hover:bg-[#c4a96a]/30 text-white"
                            }`}
                            aria-label="Previous card"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </button>

                        {/* dots */}
                        <div className="flex items-center gap-2">
                            {menu.cards.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentCard(idx)}
                                    className={`transition-all duration-300 rounded-full ${
                                        idx === currentCard
                                            ? "w-6 h-2 bg-[#c4a96a]"
                                            : "w-2 h-2 bg-white/25 hover:bg-white/40"
                                    }`}
                                    aria-label={`Go to card ${idx + 1}`}
                                />
                            ))}
                        </div>

                        {/* right arrow */}
                        <button
                            onClick={next}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                total <= 1
                                    ? "opacity-0 pointer-events-none"
                                    : "bg-white/10 hover:bg-[#c4a96a]/30 text-white"
                            }`}
                            aria-label="Next card"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ───────────────────────── main component ─────────────────────── */

export default function MenuClient({
    eventConfig,
}: {
    eventConfig: EventConfig | null;
}) {
    const [isLampraisModalOpen, setIsLampraisModalOpen] = useState(false);
    const [activeCateringMenu, setActiveCateringMenu] =
        useState<CateringMenu | null>(null);

    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Header Banner */}
            <section className="bg-[color:var(--color-cream)] text-[color:var(--color-forest)] pt-12 pb-16 px-6">
                <div className="max-w-4xl mx-auto text-center animate-fade-up">
                    <h1
                        className="text-4xl md:text-6xl font-bold mb-6"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        Our Menu
                    </h1>
                    <p className="text-lg md:text-xl text-[color:var(--color-muted)] max-w-2xl mx-auto leading-relaxed">
                        A carefully curated selection of our finest dishes.
                        Every item is prepared with fresh ingredients and a
                        passion for flavor.
                    </p>

                    {eventConfig && (
                        <div className="mt-10 flex justify-center">
                            <Link
                                href="/orders"
                                className="inline-flex items-center gap-2 bg-[#8B5E3C] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-[0_4px_14px_0_rgba(139,94,60,0.39)] hover:scale-105"
                            >
                                We have an event running right now. Order here!
                                <svg
                                    width="20"
                                    height="20"
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
                    )}
                </div>
            </section>

            {/* Content Container */}
            <div className="max-w-5xl mx-auto px-6 pb-24">
                {/* Section 1: Individual Items & Signature Dishes */}
                <section className="mb-20">
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            {individualItems.title}
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
                        {individualItems.categories.map((category, catIdx) => (
                            <div
                                key={catIdx}
                                className={`animate-fade-up delay-${(catIdx % 4) * 100}`}
                            >
                                <h3
                                    className="text-2xl font-semibold text-[color:var(--color-forest)] border-b border-[color:var(--color-border)] pb-2 mb-6"
                                    style={{ fontFamily: "var(--font-serif)" }}
                                >
                                    {category.name}
                                </h3>
                                <div className="flex flex-col gap-6">
                                    {category.items.map(
                                        (item: MenuItem, itemIdx: number) => (
                                            <div
                                                key={itemIdx}
                                                className="group"
                                            >
                                                <div className="flex items-baseline justify-between mb-1 gap-2 border-b border-transparent group-hover:border-[color:var(--color-sage)]/20 transition-all">
                                                    <h4 className="text-lg font-bold text-[color:var(--color-forest)] group-hover:text-[color:var(--color-sage)] transition-colors inline-flex items-center gap-2">
                                                        {item.name}
                                                        {item.hasTooltip && (
                                                            <button
                                                                onClick={() =>
                                                                    setIsLampraisModalOpen(
                                                                        true
                                                                    )
                                                                }
                                                                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--color-cream-dark)] text-[color:var(--color-muted)] hover:bg-[color:var(--color-sage)] hover:text-white transition-colors"
                                                                title="What is Lamprais?"
                                                                aria-label="What is Lamprais?"
                                                            >
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
                                                                    <circle
                                                                        cx="12"
                                                                        cy="12"
                                                                        r="10"
                                                                    />
                                                                    <path d="M12 16v-4" />
                                                                    <path d="M12 8h.01" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </h4>
                                                    {item.diet &&
                                                        item.diet.length >
                                                            0 && (
                                                            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 bg-[color:var(--color-sage)] text-white rounded-md mt-1">
                                                                {item.diet[0]}
                                                            </span>
                                                        )}
                                                </div>
                                                {item.description && (
                                                    <p className="text-[color:var(--color-muted)] text-sm leading-relaxed max-w-[90%]">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Section 2: Catering Style Menus */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Catering Style Menus
                        </h2>
                        <p className="text-[color:var(--color-muted)] mt-2 text-sm">
                            Click on any menu to explore the full details
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {cateringMenus.map((menu, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveCateringMenu(menu)}
                                className={`group relative bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 hover:-translate-y-1 text-left animate-fade-up`}
                                style={{ animationDelay: `${idx * 80}ms` }}
                            >
                                {/* image */}
                                <div className="relative w-full h-40 overflow-hidden">
                                    <Image
                                        src={menu.image}
                                        alt={menu.name}
                                        fill
                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        unoptimized
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

                                    {/* price badge */}
                                    {menu.price && (
                                        <span className="absolute top-3 right-3 bg-[color:var(--color-forest)] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                            {menu.price}
                                            <span className="font-normal opacity-80">
                                                /person
                                            </span>
                                        </span>
                                    )}
                                </div>

                                {/* content */}
                                <div className="p-5">
                                    <h3
                                        className="text-lg font-bold text-[color:var(--color-forest)] mb-1 group-hover:text-[color:var(--color-sage)] transition-colors"
                                        style={{
                                            fontFamily: "var(--font-serif)",
                                        }}
                                    >
                                        {menu.name}
                                    </h3>
                                    <p className="text-[color:var(--color-muted)] text-xs leading-relaxed mb-4">
                                        {menu.subtitle}
                                    </p>
                                    <span className="inline-flex items-center gap-1.5 text-[color:var(--color-sage)] text-sm font-semibold group-hover:gap-2.5 transition-all">
                                        View Menu
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M5 12h14" />
                                            <path d="m12 5 7 7-7 7" />
                                        </svg>
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            {/* Call to Action */}
            <section className="bg-[color:var(--color-cream-dark)] py-24 px-6">
                <div className="max-w-3xl mx-auto text-center animate-fade-up">
                    <h2
                        className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-6"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        See something you like?
                    </h2>
                    <p className="text-lg text-[color:var(--color-muted)] mb-10 max-w-xl mx-auto">
                        We can customize any of these options for your next
                        event or create a completely unique menu just for you.
                    </p>
                    <Link
                        href="/catering-request"
                        className="inline-block bg-[color:var(--color-sage)] text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                    >
                        Request Catering
                    </Link>
                </div>
            </section>

            {/* Lamprais Info Modal */}
            {isLampraisModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsLampraisModalOpen(false)}
                    />
                    <div className="relative bg-[#F9F7F1] rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] max-w-4xl w-full z-10 animate-scale-in">
                        <button
                            onClick={() => setIsLampraisModalOpen(false)}
                            className="absolute top-4 right-4 z-20 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-md"
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <div className="relative w-full">
                            <Image
                                src="/assets/img/tooltip/lamprais-how-its-made-compressed.png"
                                alt="How Lamprais is made"
                                width={800}
                                height={600}
                                className="w-full h-auto rounded-t-3xl"
                                unoptimized={true}
                            />
                        </div>
                        <div className="p-8 text-center text-[color:var(--color-forest)] font-medium">
                            <p>
                                Lamprais: An authentic cultural experience baked
                                in a banana leaf.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Catering Menu Modal */}
            {activeCateringMenu && (
                <CateringMenuModal
                    menu={activeCateringMenu}
                    onClose={() => setActiveCateringMenu(null)}
                />
            )}
        </main>
    );
}
