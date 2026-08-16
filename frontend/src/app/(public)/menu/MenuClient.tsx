"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { EventConfig } from "@/config/event";
import { CURRENCY } from "@/config/event";
import EVENT_CONFIG from "@/config/event-config.json";

/* ───────────────────────────── types ───────────────────────────── */

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

type AppetizerItem = EventConfig["flyer"]["appetizers"][number];
type TrayItem = EventConfig["flyer"]["trays"][number];

/* ─────────────────────── individual items data ─────────────────── */

const appetizers = EVENT_CONFIG.flyer.appetizers as AppetizerItem[];
const trays = EVENT_CONFIG.flyer.trays as TrayItem[];

const coldStarters = [
    {
        name: "Cheese Platter",
        desc: "Selection of artisanal cheeses, crackers, and savory accompaniments.",
        type: "cheese",
    },
    {
        name: "Vegetable Dip",
        desc: "Crisp garden vegetables paired with signature creamy herb dip.",
        type: "dip",
    },
    {
        name: "Assorted Cold Cuts",
        desc: "Curated sliced cured deli meats and gourmet charcuterie cuts.",
        type: "cuts",
    },
    {
        name: "Charcuterie board",
        desc: "Artful board of fine meats, cheeses, dried fruits, nuts, and crisps.",
        type: "charcuterie",
    },
    {
        name: "Finger Sandwiches",
        desc: "Delicate crustless tea sandwiches with assorted gourmet fillings.",
        type: "sandwiches",
    },
    {
        name: "Assorted cold canape",
        desc: "Bite-sized chilled canapes crafted for elegant mingling and events.",
        type: "canape",
    },
];

const desserts = [
    {
        name: "Pineapple Pudding",
        note: "Classic tropical dessert infused with fresh pineapple sweetness.",
        type: "pudding",
    },
    {
        name: "Fruit Trifle",
        note: "Layered sponge cake, rich velvety custard, and fresh fruits.",
        type: "trifle",
    },
    {
        name: "Fresh Fruit Salad",
        note: "Refreshing medley of freshly cut seasonal tropical fruits.",
        type: "fruitSalad",
    },
    {
        name: "Fresh Fruit Platter",
        note: "Artfully arranged seasonal sliced fruits perfect for sharing.",
        type: "fruitPlatter",
    },
    {
        name: "Cream Caramel",
        note: "Silky smooth baked egg custard with a rich amber caramel glaze.",
        type: "creamCaramel",
    },
    {
        name: "Watalappan",
        note: "Authentic steamed coconut custard sweetened with kitul jaggery and warm spices (Based on availability).",
        type: "watalappan",
    },
];

const kidsDishes = [
    {
        name: "Pasta with Chicken and Rose Sauce",
        desc: "Tender pasta tossed with chicken breast in a creamy tomato sauce.",
    },
    {
        name: "Spaghetti and Meat balls with Tomato Sauce",
        desc: "Classic spaghetti with savory meatballs in rich tomato sauce.",
    },
    {
        name: "Chicken Fingers with Ketchup",
        desc: "Crispy golden breaded chicken tenders served with ketchup.",
    },
];

function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: CURRENCY,
        minimumFractionDigits: price % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(price);
}

function ColdStarterIcon({ type }: { type: string }) {
    switch (type) {
        case "cheese":
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m19 6-9-3-8 3v6l8 3 9-3V6z" />
                    <path d="M10 15V9" />
                    <circle cx="6" cy="9" r="1" />
                    <circle cx="14" cy="11" r="1" />
                </svg>
            );
        case "dip":
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 11a8 8 0 0 0 16 0H4z" />
                    <path d="M12 2v5" />
                    <path d="m9 4 3 3 3-3" />
                    <line x1="2" y1="11" x2="22" y2="11" />
                </svg>
            );
        case "cuts":
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="8" rx="8" ry="4" />
                    <path d="M4 8v4c0 2.2 3.6 4 8 4s8-1.8 8-4V8" />
                    <path d="M4 12v4c0 2.2 3.6 4 8 4s8-1.8 8-4v-4" />
                </svg>
            );
        case "charcuterie":
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="14" height="16" rx="3" />
                    <path d="M17 10h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4" />
                    <circle cx="8" cy="9" r="1.5" />
                    <line x1="12" y1="8" x2="14" y2="14" />
                    <line x1="7" y1="15" x2="13" y2="15" />
                </svg>
            );
        case "sandwiches":
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11l9-6 9 6-9 6-9-6z" />
                    <path d="M3 15l9 6 9-6" />
                </svg>
            );
        case "canape":
        default:
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="7" r="4" />
                    <path d="M6 17a6 6 0 0 1 12 0H6z" />
                    <line x1="12" y1="2" x2="12" y2="3" />
                    <line x1="4" y1="20" x2="20" y2="20" />
                </svg>
            );
    }
}

function DessertIcon({ type }: { type: string }) {
    switch (type) {
        case "pudding":
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2 4-2 2-2-2 2-4z" />
                    <path d="M6 10a6 6 0 0 0 12 0v-1H6v1z" />
                    <path d="M4 17a8 8 0 0 0 16 0v-4H4v4z" />
                    <line x1="2" y1="21" x2="22" y2="21" />
                </svg>
            );
        case "trifle":
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h14l-2 9H7L5 4z" />
                    <line x1="12" y1="13" x2="12" y2="19" />
                    <line x1="8" y1="20" x2="16" y2="20" />
                    <line x1="6" y1="8" x2="18" y2="8" />
                </svg>
            );
        case "fruitSalad":
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10a8 8 0 0 0 16 0H4z" />
                    <circle cx="9" cy="6" r="2" />
                    <circle cx="15" cy="6" r="2" />
                    <line x1="2" y1="19" x2="22" y2="19" />
                </svg>
            );
        case "fruitPlatter":
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="14" rx="10" ry="5" />
                    <circle cx="9" cy="9" r="2" />
                    <circle cx="15" cy="9" r="2" />
                    <path d="M12 4v4" />
                </svg>
            );
        case "creamCaramel":
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 18l2-9h8l2 9H6z" />
                    <path d="M9 9c0 1.5 1.5 2 3 2s3-.5 3-2" />
                    <line x1="3" y1="21" x2="21" y2="21" />
                </svg>
            );
        case "watalappan":
        default:
            return (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 11a8 8 0 0 0 16 0v-2H4v2z" />
                    <path d="M12 3c-2 2-3 4-3 6h6c0-2-1-4-3-6z" />
                    <line x1="3" y1="19" x2="21" y2="19" />
                </svg>
            );
    }
}

/* ─────────────────────── catering menus data ──────────────────── */

const cateringMenus: CateringMenu[] = [
    {
        name: "Standard Menu",
        subtitle: "Classic Sri Lankan catering for every occasion",
        price: "$19",
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
                    {
                        label: "Lentils / Sides",
                        value: "Dhal Fry or Devilled Potato",
                    },
                    { label: "Vegetables", value: "Beans" },
                    { label: "Pickle", value: "Brinjal Moju" },
                ],
                note: "Beef, mutton, pork and shrimp options available upon request. Additional charges apply.",
            },
            {
                title: "Option 2",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Fried Rice" },
                    { label: "Chicken", value: "Devilled Chicken" },
                    { label: "Fish", value: "Fish Curry" },
                    { label: "Sides", value: "Cashew Curry" },
                    { label: "Vegetables", value: "Vegetable Chop Suey" },
                    { label: "Condiments", value: "Papadam" },
                ],
                note: "Beef, mutton, pork and shrimp options available upon request. Additional charges apply.",
            },
            {
                title: "Option 3",
                image: "/assets/food/menu/standard-menu.png",
                items: [
                    { label: "Rice", value: "Ghee Rice" },
                    { label: "Chicken", value: "Baked Chicken Curry" },
                    { label: "Fish", value: "Devilled Fish" },
                    { label: "Lentils", value: "Dhal Fry" },
                    { label: "Vegetables", value: "Beans Curry, Polos Curry" },
                ],
                note: "Beef, mutton, pork and shrimp options available upon request. Additional charges apply.",
            },
        ],
    },
    {
        name: "Buffet Style Menu 1",
        subtitle: "An elegant buffet with curated selections",
        price: "$23",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/buffet-1.png",
        cards: [
            {
                title: "Main Spread",
                image: "/assets/food/menu/buffet-1.png",
                items: [
                    { label: "Salad", value: "Garden Salad" },
                    { label: "Rice", value: "Fried Rice" },
                    { label: "Chicken", value: "Oven Baked Chicken Curry" },
                    { label: "Prawn", value: "Spicy Garlic Onion Prawn" },
                    {
                        label: "Vegetables (select 3)",
                        value: "Dhal Tempered, Potato White Curry, Cashew Curry, Green Bean Curry, or Brinjal Pahi",
                    },
                    { label: "Condiments", value: "Papadam" },
                    { label: "Dessert", value: "Cream Caramel" },
                ],
                note: "Beef, mutton, and pork options available upon request. Additional charges apply.",
            },
        ],
    },
    {
        name: "Buffet Style Menu 2",
        subtitle: "A lavish spread with more variety",
        price: "$27",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/buffet-2.png",
        cards: [
            {
                title: "Full Spread",
                image: "/assets/food/menu/buffet-2.png",
                items: [
                    { label: "Salads", value: "Garden Salad, Egg Salad" },
                    { label: "Rice", value: "Yellow Rice" },
                    { label: "Chicken", value: "Oven Baked Chicken Curry" },
                    { label: "Prawn", value: "Spicy Garlic Onion Prawn" },
                    { label: "Fish", value: "Fish Curry" },
                    { label: "Sides", value: "Fried Potato, Cashew Curry" },
                    { label: "Pickle", value: "Brinjal Moju" },
                    { label: "Dessert", value: "Cream Caramel" },
                ],
                note: "Beef, mutton, and pork options available upon request. Additional charges apply.",
            },
        ],
    },
    {
        name: "Classic Curry Menu",
        subtitle: "Build your own classic curry experience",
        price: "$29.50",
        priceNote: "per person (min. 30 persons)",
        image: "/assets/food/menu/classic-curry.png",
        cards: [
            {
                title: "Salads & Rice",
                image: "/assets/food/menu/classic-curry.png",
                items: [
                    {
                        label: "Salads (select 2)",
                        value: "Garden Salad, Beet Salad, Potato Salad, or Cucumber Onion Yogurt",
                    },
                    {
                        label: "Rice / Noodles (select 2)",
                        value: "Fried Rice, Yellow Rice, Brown Rice, or Vegetable Egg Noodle",
                    },
                ],
            },
            {
                title: "Proteins",
                image: "/assets/food/menu/classic-curry.png",
                items: [
                    {
                        label: "Chicken (select 1)",
                        value: "Devilled Chicken, Chicken Stir-fry, or Oven Baked Chicken Curry",
                    },
                    {
                        label: "Fish (select 1)",
                        value: "Fish Ambulthiyal, White Fish Curry, Spicy Mustard Fish Curry, or Fish Korma",
                    },
                    {
                        label: "Prawn (select 1)",
                        value: "Garlic Prawn, Brown Prawn Curry, or Fried Prawn",
                    },
                ],
            },
            {
                title: "Vegetables & Desserts",
                image: "/assets/food/menu/desserts.png",
                items: [
                    {
                        label: "Vegetables (select 3)",
                        value: "Dhal Curry, Brinjal Moju, Brinjal Pahi, Mixed Vegetable Curry, Bean Curry, Potato Curry, Potato Tempered, Cauliflower and Potato Masala, Cashew Curry, Cabbage Mallum, Pineapple Curry, Kola Mallum, or Dhal and Spinach Tempered",
                    },
                    { label: "Condiments (select 1)", value: "Papadam or Pickle" },
                    {
                        label: "Dessert",
                        value: "Fruit Platter or Cream Caramel",
                    },
                ],
                note: "Beef, mutton, and pork options available upon request. Additional charges apply.",
            },
        ],
    },
    {
        name: "International Buffet",
        subtitle: "A fusion of Sri Lankan and international cuisine",
        price: "$39",
        priceNote: "per person (min. 35 persons)",
        image: "/assets/food/menu/international-buffet.png",
        cards: [
            {
                title: "Salads & Starches",
                image: "/assets/food/menu/international-buffet.png",
                items: [
                    {
                        label: "Salad with Dressing (select 2)",
                        value: "Potato Salad, Garden Salad, Beet Salad, Apple Coleslaw, Cucumber and Tomato Yogurt, Pasta Salad, or Caesar Salad",
                    },
                    {
                        label: "Rice / Noodles / Pasta / Potatoes (select 2)",
                        value: "Fried Rice, Yellow Rice, Plain Buttered Rice, Fried Noodles, Pasta with Tomato Sauce, Penne Pasta with Tomato Sauce, Spaghetti with Mushroom Sauce, Roasted Herb Potato, or Lyonnais Potato (with onion)",
                    },
                ],
            },
            {
                title: "Proteins",
                image: "/assets/food/menu/international-buffet.png",
                items: [
                    {
                        label: "Chicken (select 1)",
                        value: "Chicken Stir-fry, Chicken with Cashew, Chicken Red Wine Sauce, Chicken Mushroom Sauce, Red Chicken Curry with Lemongrass, Chicken Korma, or Chicken Masala",
                    },
                    {
                        label: "Fish (select 1)",
                        value: "Fish with White Wine Sauce, Devilled Fish, Fish Curry, Fish Masala, Fish with Mandarin Sauce, or Sweet and Sour Fish",
                    },
                    {
                        label: "Prawn (select 1)",
                        value: "Prawn Provencal, Prawn Teriyaki, Prawn Stir-fry, Prawn with White Wine Sauce, Prawn Kadi, Prawn Curry, Prawn Telata, or Prawn Sweet and Sour",
                    },
                ],
            },
            {
                title: "Vegetables & Desserts",
                image: "/assets/food/menu/desserts.png",
                items: [
                    {
                        label: "Vegetables (select 3)",
                        value: "Garden Vegetable, Buttered Broccoli, Glazed Carrot, Mixed Vegetable Curry, Vegetable Chop Suey, Steam Vegetable, Bean Curry, Polos Maluwa, Cashew Curry, Brinjal Moju, Dhal Tempered, Dhal and Spinach Tempered, or Cauliflower and Potato Masala",
                    },
                    { label: "Condiments", value: "Papadam and Pickle" },
                    {
                        label: "Dessert (select 2)",
                        value: "Fresh Fruit Salad, Cream Caramel, or Fruit Trifle",
                    },
                ],
            },
        ],
    },
    {
        name: "Set Menu",
        subtitle: "Table d'Hote - fine dining experience",
        price: "Market Price",
        priceNote: "(Price will vary according to market price)",
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
                        label: "Meat (select 1)",
                        value: "Roasted Beef Strip Loin with Mushroom Sauce or Pepper Sauce, or Oven Baked Salmon Fillet with White Wine Sauce or Caper Butter Sauce",
                    },
                    {
                        label: "Accompaniment",
                        value: "Mashed Potato or Herb Roasted Potato",
                    },
                    { label: "Vegetable", value: "Buttered Vegetable Medley" },
                    { label: "Dessert", value: "Orange Cream Caramel" },
                ],
                note: "Price will vary according to market price.",
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

function AppetizerCard({ item }: { item: AppetizerItem }) {
    return (
        <article className="group bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300">
            <div className="relative h-36 overflow-hidden">
                <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    style={item.imagePosition ? { objectPosition: item.imagePosition } : undefined}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                <span className="absolute top-3 right-3 bg-[color:var(--color-forest)]/90 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                    Min. {item.minOrder} pcs
                </span>
                <h4
                    className="absolute bottom-3 left-4 text-xl font-bold text-white drop-shadow-md"
                    style={{ fontFamily: "var(--font-serif)" }}
                >
                    {item.name}
                </h4>
            </div>
            <div className="px-4 py-3">
                {item.varieties.map((variety, index) => (
                    <div
                        key={variety.name}
                        className={`flex items-center justify-between py-1.5 text-sm ${
                            index < item.varieties.length - 1
                                ? "border-b border-[color:var(--color-border)]/60"
                                : ""
                        }`}
                    >
                        <span className="text-[color:var(--color-text)]">{variety.name}</span>
                        <span className="font-bold text-[color:var(--color-forest)] tabular-nums">
                            {formatPrice(variety.price)}
                        </span>
                    </div>
                ))}
            </div>
        </article>
    );
}

function TrayCard({ item }: { item: TrayItem }) {
    return (
        <article className="group bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300">
            <div className="relative h-36 overflow-hidden">
                <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                <span className="absolute top-3 right-3 bg-[color:var(--color-forest)] text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    {formatPrice(item.price)}
                </span>
                <div className="absolute bottom-3 left-4 right-4">
                    <h3
                        className="text-lg font-bold text-white drop-shadow-md"
                        style={{ fontFamily: "var(--font-serif)" }}
                    >
                        {item.name}
                    </h3>
                    <p className="text-white/80 text-xs mt-0.5">{item.size}</p>
                </div>
            </div>
        </article>
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
            <div className="max-w-5xl mx-auto px-6 pb-24 space-y-24">
                {/* Section 1: Individual Items & Signature Dishes */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Individual Items &amp; Signature Dishes
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 animate-fade-up">
                        {/* Lamprais Hero Card */}
                        <div className="group relative bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 flex flex-col">
                            <div className="relative h-64 overflow-hidden">
                                <Image
                                    src="/assets/food/lamprais.jpg"
                                    alt="Lamprais - Our Signature Dish"
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                {/* Badges on image */}
                                <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                                    <span className="bg-[color:var(--color-sage)] text-white text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-lg">
                                        Signature
                                    </span>
                                    <span className="bg-[#8B5E3C] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                        $23
                                    </span>
                                    <span className="bg-[color:var(--color-forest)] text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                                        Min. 20 packets
                                    </span>
                                </div>
                            </div>

                            <div className="p-8 flex flex-col flex-1 justify-between">
                                <div>
                                    <h3
                                        className="text-2xl md:text-3xl font-bold text-[color:var(--color-forest)] mb-3"
                                        style={{ fontFamily: "var(--font-serif)" }}
                                    >
                                        Lamprais
                                    </h3>
                                    <p className="text-[color:var(--color-muted)] text-sm leading-relaxed mb-4">
                                        Wrapped in a banana leaf with Ghee Rice, Baked Chicken Curry, Fried Boiled Egg, Seeni Sambal, Fricadells (choice of Beef &amp; Pork or Fish Cutlet), Ash Plantain Curry, Brinjal Pahi, and Blachan.
                                    </p>
                                    <p className="text-[color:var(--color-sage)] text-xs font-medium italic mb-6">
                                        *Fish and vegetarian options available upon request.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsLampraisModalOpen(true)}
                                    className="inline-flex items-center gap-2 text-[color:var(--color-sage)] font-semibold text-sm hover:text-[color:var(--color-forest)] transition-colors group/btn"
                                >
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
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 16v-4" />
                                        <path d="M12 8h.01" />
                                    </svg>
                                    How it&apos;s made
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="group-hover/btn:translate-x-1 transition-transform"
                                    >
                                        <path d="M5 12h14" />
                                        <path d="m12 5 7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Chicken Biryani Hero Card */}
                        <div className="group relative bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 flex flex-col">
                            <div className="relative h-64 overflow-hidden">
                                <Image
                                    src="/assets/food/chicken-biryani.webp"
                                    alt="Chicken Biryani with Raita"
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                {/* Badges on image */}
                                <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                                    <span className="bg-[color:var(--color-sage)] text-white text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-lg">
                                        Signature
                                    </span>
                                    <span className="bg-[#8B5E3C] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                        $18
                                    </span>
                                    <span className="bg-[color:var(--color-forest)] text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                                        Min. 25 persons
                                    </span>
                                </div>
                            </div>

                            <div className="p-8 flex flex-col flex-1 justify-between">
                                <div>
                                    <h3
                                        className="text-2xl md:text-3xl font-bold text-[color:var(--color-forest)] mb-3"
                                        style={{ fontFamily: "var(--font-serif)" }}
                                    >
                                        Chicken Biryani with Raita
                                    </h3>
                                    <p className="text-[color:var(--color-muted)] text-sm leading-relaxed mb-4">
                                        Aromatic basmati rice layered with flavorful marinated chicken, traditional spices, and fresh herbs, served alongside cool cucumber yogurt raita.
                                    </p>
                                    <p className="text-[color:var(--color-sage)] text-xs font-medium italic mb-6">
                                        *Minimum Order: 25 persons.
                                    </p>
                                </div>
                                <Link
                                    href="/catering-request"
                                    className="inline-flex items-center gap-2 text-[color:var(--color-sage)] font-semibold text-sm hover:text-[color:var(--color-forest)] transition-colors group/btn"
                                >
                                    Inquire for Catering
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="group-hover/btn:translate-x-1 transition-transform"
                                    >
                                        <path d="M5 12h14" />
                                        <path d="m12 5 7 7-7 7" />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 2: Appetizers and Spreads */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Appetizers and Spreads
                        </h2>
                    </div>

                    {/* Hot Starters */}
                    <div className="mb-14 animate-fade-up">
                        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] pb-2 mb-6">
                            <h3
                                className="text-2xl font-semibold text-[color:var(--color-forest)]"
                                style={{ fontFamily: "var(--font-serif)" }}
                            >
                                Hot Starters
                            </h3>
                            <span className="text-xs text-[color:var(--color-muted)] font-medium">
                                Minimum order: 10 pieces
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {appetizers.map((item) => (
                                <AppetizerCard key={item.name} item={item} />
                            ))}
                        </div>
                    </div>

                    {/* Cold Starters */}
                    <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
                        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] pb-2 mb-4">
                            <h3
                                className="text-xl font-semibold text-[color:var(--color-forest)]"
                                style={{ fontFamily: "var(--font-serif)" }}
                            >
                                Cold Starters
                            </h3>
                            <span className="text-xs text-[color:var(--color-muted)] font-medium">
                                Minimum order: 10
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {coldStarters.map((starter) => (
                                <div
                                    key={starter.name}
                                    className="group bg-white rounded-2xl border border-[color:var(--color-border)] p-3 px-3.5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-[color:var(--color-sage)]/10 text-[color:var(--color-sage)] group-hover:bg-[color:var(--color-sage)] group-hover:text-white transition-colors duration-200 shrink-0 flex items-center justify-center">
                                        <ColdStarterIcon type={starter.type} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4
                                            className="text-sm font-bold text-[color:var(--color-forest)] leading-snug truncate"
                                            style={{ fontFamily: "var(--font-serif)" }}
                                        >
                                            {starter.name}
                                        </h4>
                                        <p className="text-[11px] text-[color:var(--color-muted)] leading-tight mt-0.5 truncate">
                                            {starter.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Section 3: Catering Style Menus */}
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
                                className="group relative bg-white rounded-3xl border border-[color:var(--color-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 hover:-translate-y-1 text-left animate-fade-up"
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
                                        <span className="absolute top-3 right-3 bg-[#8B5E3C] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                            {menu.price}
                                            {menu.price !== "Market Price" && (
                                                <span className="font-normal opacity-80">
                                                    /person
                                                </span>
                                            )}
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

                {/* Section 4: Desserts (Moved after Catering Style Menus) */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-8 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Desserts
                        </h2>
                        <p className="text-[color:var(--color-muted)] mt-2 text-sm">
                            Sweet finishes to complement your celebration
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {desserts.map((dessert) => (
                            <article
                                key={dessert.name}
                                className="group bg-white rounded-3xl border border-[color:var(--color-border)] p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="w-12 h-12 rounded-2xl bg-[#c4a96a]/15 text-[#8B5E3C] group-hover:bg-[#8B5E3C] group-hover:text-white transition-colors duration-300 flex items-center justify-center mb-4">
                                        <DessertIcon type={dessert.type} />
                                    </div>
                                    <h3
                                        className="text-lg font-bold text-[color:var(--color-forest)] mb-1.5"
                                        style={{ fontFamily: "var(--font-serif)" }}
                                    >
                                        {dessert.name}
                                    </h3>
                                    <p className="text-xs text-[color:var(--color-muted)] leading-relaxed">
                                        {dessert.note}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Section 5: Kid's Special Dishes (After Desserts) */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-8 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Kid&apos;s Special Dishes
                        </h2>
                        <p className="text-[color:var(--color-muted)] mt-2 text-sm">
                            Crowd-pleasing dishes specially crafted for children
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {kidsDishes.map((dish) => (
                            <article
                                key={dish.name}
                                className="group bg-white rounded-3xl border border-[color:var(--color-border)] p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="w-12 h-12 rounded-2xl bg-[color:var(--color-sage)]/15 text-[color:var(--color-sage)] group-hover:bg-[color:var(--color-sage)] group-hover:text-white transition-colors duration-300 flex items-center justify-center mb-4">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                                            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                                            <line x1="6" y1="1" x2="6" y2="4" />
                                            <line x1="10" y1="1" x2="10" y2="4" />
                                            <line x1="14" y1="1" x2="14" y2="4" />
                                        </svg>
                                    </div>
                                    <h3
                                        className="text-lg font-bold text-[color:var(--color-forest)] mb-2"
                                        style={{ fontFamily: "var(--font-serif)" }}
                                    >
                                        {dish.name}
                                    </h3>
                                    <p className="text-xs text-[color:var(--color-muted)] leading-relaxed">
                                        {dish.desc}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Section 6: Trays (After Kid's Special Dishes) */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-8 text-center md:text-left animate-fade-up">
                        <h2
                            className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                        >
                            Trays
                        </h2>
                        <p className="text-[color:var(--color-muted)] mt-2 text-sm">
                            Half trays prepared for sharing
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trays.map((item) => (
                            <TrayCard key={item.name} item={item} />
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
