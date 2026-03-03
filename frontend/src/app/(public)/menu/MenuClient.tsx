"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { EventConfig } from "@/config/event";

interface MenuItem {
    name: string;
    description: string;
    diet?: string[];
    hasTooltip?: boolean;
}

export default function MenuClient({ eventConfig }: { eventConfig: EventConfig | null }) {
    const [isLampraisModalOpen, setIsLampraisModalOpen] = useState(false);

    const individualItems = {
        title: "Individual Items & Speciality Dishes",
        categories: [
            {
                name: "Dishes",
                items: [
                    {
                        name: "Lamprais",
                        description: "Wrapped in a banana leaf with Ghee Rice, Baked Chicken Curry, Fried boiled egg, Seeni Sambal, Fricadells (Beef and Pork), Ash Plantain curry, Brinjal Pahie, and Blachan.",
                        diet: ["Signature"],
                        hasTooltip: true
                    },
                    {
                        name: "Chicken Biryani with Raita",
                        description: "Aromatic basmati rice cooked with rich spices, tender chicken, and served with cooling raita.",
                        diet: []
                    }
                ]
            },
            {
                name: "Kid's Special Dishes",
                items: [
                    { name: "Pasta with Chicken and Rose sauce", description: "A mild, creamy rose sauce pasta perfect for kids.", diet: [] },
                    { name: "Meat balls with Tomato sauce", description: "Classic tender meatballs in a sweet tomato sauce.", diet: [] },
                    { name: "Chicken Fingers with Plum Sauce", description: "Crispy breaded chicken fingers served with sweet plum dipping sauce.", diet: [] }
                ]
            },
            {
                name: "Appetizers",
                items: [
                    { name: "Cutlets - Fish", description: "Spiced fish and potato croquettes, breaded and fried golden.", diet: [] },
                    { name: "Patties - Fish", description: "Flaky savory pastries filled with spiced fish.", diet: [] },
                    { name: "Rolls - Fish, Mutton & Chicken", description: "Crispy fried rolls filled with your choice of savory spiced meats or fish.", diet: [] },
                ]
            },
            {
                name: "Speciality Items",
                items: [
                    { name: "Sri Lankan Wedding Cakes", description: "A rich, heavily spiced fruit cake enriched with cashew nuts, preserves, and brandy, covered in almond icing.", diet: [] }
                ]
            }
        ]
    };

    const cateringMenus = {
        title: "Catering Style Menus",
        categories: [
            {
                name: "Standard Menu",
                items: [
                    { name: "Option 1", description: "Tempered Yellow Rice, Chicken Curry, Fish Ambulthiyal, Dhal Fry, Beans, Bringal Moju, and Devilled Potato." },
                    { name: "Option 2", description: "Fried Rice, Chicken Devilled, Fish Curry, Potato Tempered, Cashew, Vegetable Chop Suey, and Papadam and Fried Chilli." },
                    { name: "Option 3", description: "Ghee Rice, Baked Chicken Curry, Devilled Fish, Dhal Fry, Bean Curry, Polos Curry, and Fish Cutlet." },
                    { name: "Option 4", description: "Tempered Yellow Rice, Chicken Baked Curry, Fish/Pork, Dhal Fry/Potato White Curry, Vegetable Chop Suey/Bean Curry, Cashew Curry, and Papadam and Fried Chilli." }
                ]
            },
            {
                name: "Buffet Style Menu 1",
                items: [
                    { name: "Menu", description: "Garden Salad, Egg Fried Rice, Chicken Oven Baked Curry, Spicy Garlic Onion Prawn, Green Bean Curry, Brinjal Pahi, Papadam and Fried Chilli, and Cream Caramel." },
                    { name: "Choice of one", description: "Dhal Tempered, Potato White Curry, or Cashew Curry." }
                ]
            },
            {
                name: "Buffet Style Menu 2",
                items: [
                    { name: "Menu", description: "Garden Salad, Egg Salad, Yellow Rice, Chicken Oven Baked Curry, Spicy Garlic Onion Prawn, Fish curry, Fried Potato, Cashew curry, Brinjal Moju, and Cream Caramel." }
                ]
            },
            {
                name: "Classic Curry Menus",
                items: [
                    { name: "Salads (select 2)", description: "Garden Salad, Beet Salad, Potato Salad, or Cucumber Onion Yoghurt." },
                    { name: "Rice/Noodles (select 2)", description: "Fried Rice, Yellow Rice, Vegetable Egg Noodle, or Brown Rice." },
                    { name: "Chicken (select 1)", description: "Chicken-Devilled, Chicken Stir-fry, or Oven Backed Curry." },
                    { name: "Fish (select 1)", description: "Fish Ambulthiyal, Fish white Curry, Spicy mustard Fish Curry, or Fish Korma." },
                    { name: "Prawn (select 1)", description: "Garlic Prawn, Prawn Brown Curry, or Prawn Fried." },
                    { name: "Vegetable (select 3)", description: "Dhall Curry, Brinjal Moju, Brinjal Pahi, Mixed Vegetable Curry, Bean Curry, Potato Curry, Potato Tempered, Cauliflower and Potato Masala, Cashew Curry, Cabbage Mallum, Pineapple Curry, Kola Mallum, or Dhal and Spinach Tempered." },
                    { name: "Condiments", description: "Papadam or Pickle." },
                    { name: "Desserts (select 2)", description: "Fruit Platter, Cream Caramel, or Chocolate Pudding." }
                ]
            },
            {
                name: "International Buffet",
                items: [
                    { name: "Salads (select 2)", description: "Potato salad, Garden salad, Beet Salad, Apple Cole Slow, Cucumber and Tomato Yoghurt, Pasta Salad, or Caesar Salad." },
                    { name: "Rice/Noodles/Pasta (select 2)", description: "Fried Rice, Yellow Rice, Plain Buttered Rice, Fried Noodles, Pasta with Tomato Sauce, Roasted Herb Potato, Lyonnais Potato (with Onion), Penne Pasta with Tomato sauce, or Spaghetti with Mushroom Sauce." },
                    { name: "Chicken (select 1)", description: "Chicken Stir-fry, Chicken with cashew nuts, Chicken Red wine sauce, Chicken mushroom sauce, Chicken red Curry with Lemon Grass, Chicken Korma, or Chicken Masala." },
                    { name: "Fish (select 1)", description: "Fish with white Wine sauce, Devilled Fish, Fish curry, Fish Masala, Fish with Mandarin Sauce, or Sweet and Sour Fish." },
                    { name: "Prawn (select 1)", description: "Prawn Provencal, Teriyaki, Prawn Stir-fry, Prawn with White Wine sauce, Prawn Kadi, Prawn Curry, Prawn Telata, or Prawn Sweet and Sour." },
                    { name: "Vegetable (select 3)", description: "Garden Vegetable, Buttered Broccoli, Glazed Carrot, Mixed Vegetable Curry, Bean Curry, Vegetable Chop suey, Polos Maluwa, Cashew Curry, Brinjal Moju, Dhal Tempered, Dhal and Spinach Tempered, Cauliflower and Potato Masala, or Steam Vegetable." },
                    { name: "Condiments", description: "Papadam, Pickle, and Dressing." },
                    { name: "Dessert (select 2)", description: "Fresh Fruit Salad, Cream Caramel, or Chocolate Pudding." }
                ]
            },
            {
                name: "Set Menu (Table d'Hote)",
                items: [
                    { name: "Salad", description: "Garden Spring Vegetable Salad with Mango Vinaigrette." },
                    { name: "Main (choice of)", description: "Roasted Beef Striploin with Mushroom Sauce or Pepper Sauce OR Oven Baked Salmon Fillet with White wine Sauce or Caper Butter Sauce." },
                    { name: "Accompaniment (choice of)", description: "Mashed Potato or Herb Roast Potato." },
                    { name: "Vegetable", description: "Buttered Vegetable Medley." },
                    { name: "Dessert", description: "Orange Cream Caramel." }
                ]
            },
            {
                name: "Additional Desserts (For all catering menus)",
                items: [
                    { name: "Pineapple gateau", description: "Light sponge cake layered with fresh pineapple compote." },
                    { name: "Marshmallow pudding", description: "Soft, sweet, and colorful marshmallow pudding." },
                    { name: "Cream Caramel", description: "Silky baked custard dessert topped with a clear caramel layer." },
                    { name: "Mango Mousse", description: "Light, airy tropical mango mousse." },
                    { name: "Fresh Fruit Salad", description: "Assorted fresh seasonal fruits tossed in a light syrup." },
                    { name: "Fresh Fruit Platter", description: "Elegantly arranged seasonal fresh cut fruits." }
                ]
            }
        ]
    };

    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Header Banner */}
            <section className="bg-[color:var(--color-cream)] text-[color:var(--color-forest)] py-20 px-6 mt-10">
                <div className="max-w-4xl mx-auto text-center animate-fade-up">
                    <h1 className="text-4xl md:text-6xl font-bold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                        Our Menu
                    </h1>
                    <p className="text-lg md:text-xl text-[color:var(--color-muted)] max-w-2xl mx-auto leading-relaxed">
                        A carefully curated selection of our finest dishes. Every item is prepared with fresh ingredients and a passion for flavor.
                    </p>

                    {eventConfig && (
                        <div className="mt-10 flex justify-center">
                            <Link
                                href="/orders"
                                className="inline-flex items-center gap-2 bg-[#8B5E3C] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-[0_4px_14px_0_rgba(139,94,60,0.39)] hover:scale-105"
                            >
                                We have an event running right now. Order here!
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </Link>
                        </div>
                    )}
                </div>
            </section>

            {/* Content Container */}
            <div className="max-w-5xl mx-auto px-6 pb-24">

                {/* Section 1: Individual Items */}
                <section className="mb-20">
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
                            {individualItems.title}
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
                        {individualItems.categories.map((category, catIdx) => (
                            <div key={catIdx} className={`animate-fade-up delay-${(catIdx % 4) * 100}`}>
                                <h3 className="text-2xl font-semibold text-[color:var(--color-forest)] border-b border-[color:var(--color-border)] pb-2 mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                                    {category.name}
                                </h3>
                                <div className="flex flex-col gap-6">
                                    {category.items.map((item: MenuItem, itemIdx: number) => (
                                        <div key={itemIdx} className="group">
                                            <div className="flex items-baseline justify-between mb-1 gap-2 border-b border-transparent group-hover:border-[color:var(--color-sage)]/20 transition-all">
                                                <h4 className="text-lg font-bold text-[color:var(--color-forest)] group-hover:text-[color:var(--color-sage)] transition-colors inline-flex items-center gap-2">
                                                    {item.name}
                                                    {item.hasTooltip && (
                                                        <button
                                                            onClick={() => setIsLampraisModalOpen(true)}
                                                            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--color-cream-dark)] text-[color:var(--color-muted)] hover:bg-[color:var(--color-sage)] hover:text-white transition-colors"
                                                            title="What is Lamprais?"
                                                            aria-label="What is Lamprais?"
                                                        >
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <circle cx="12" cy="12" r="10"></circle>
                                                                <path d="M12 16v-4"></path>
                                                                <path d="M12 8h.01"></path>
                                                            </svg>
                                                        </button>
                                                    )}
                                                </h4>
                                                {item.diet && item.diet.length > 0 && (
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
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Section 2: Catering Style Menus */}
                <section>
                    <div className="border-b border-[color:var(--color-border)] pb-4 mb-10 text-center md:text-left animate-fade-up">
                        <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
                            {cateringMenus.title}
                        </h2>
                    </div>

                    <div className="flex flex-col gap-6">
                        {cateringMenus.categories.map((category, catIdx) => (
                            <details key={catIdx} className="group bg-white rounded-2xl border border-[color:var(--color-border)] shadow-sm animate-fade-up overflow-hidden">
                                <summary className="flex items-center justify-between p-6 cursor-pointer list-none select-none hover:bg-[color:var(--color-cream-dark)] transition-colors outline-none [&::-webkit-details-marker]:hidden">
                                    <h3 className="text-xl md:text-2xl font-semibold text-[color:var(--color-forest)] group-hover:text-[color:var(--color-sage)] transition-colors" style={{ fontFamily: "var(--font-serif)" }}>
                                        {category.name}
                                    </h3>
                                    <span className="text-[color:var(--color-forest)] transition-transform duration-300 group-open:rotate-180 flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-[color:var(--color-cream)]">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </span>
                                </summary>
                                <div className="p-6 pt-0 border-t border-[color:var(--color-border)]">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mt-6">
                                        {category.items.map((item, itemIdx) => (
                                            <div key={itemIdx} className="group/item">
                                                <h4 className="text-[color:var(--color-forest)] font-bold text-base mb-1 inline-flex items-center gap-2">
                                                    {item.name}
                                                </h4>
                                                {item.description && (
                                                    <p className="text-[color:var(--color-muted)] text-sm leading-relaxed">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                </section>
            </div>

            {/* Call to Action */}
            <section className="bg-[color:var(--color-cream-dark)] py-24 px-6">
                <div className="max-w-3xl mx-auto text-center animate-fade-up">
                    <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                        See something you like?
                    </h2>
                    <p className="text-lg text-[color:var(--color-muted)] mb-10 max-w-xl mx-auto">
                        We can customize any of these options for your next event or create a completely unique menu just for you.
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
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsLampraisModalOpen(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative bg-[#F9F7F1] rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] max-w-4xl w-full z-10 animate-scale-in">
                        <button
                            onClick={() => setIsLampraisModalOpen(false)}
                            className="absolute top-4 right-4 z-20 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-md"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
                            <p>Lamprais: An authentic cultural experience baked in a banana leaf.</p>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
