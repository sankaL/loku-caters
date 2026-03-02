import Link from "next/link";

export const metadata = {
    title: "Catering Menu | Loku Caters",
    description: "Explore our rich selection of authentic Sri Lankan appetizers, classic curries, lamprais, and desserts.",
};

export default function MenuPage() {
    const menuCategories = [
        {
            title: "Appetizers",
            description: "Perfect bite-sized starters to begin your culinary journey.",
            items: [
                { name: "Fish Cutlets", description: "Spiced mackerel and potato mix, breaded and deep-fried to golden perfection.", diet: ["Halal"] },
                { name: "Fish Patties", description: "Flaky pastry pockets filled with savory spiced fish and vegetables.", diet: ["Halal"] },
                { name: "Mutton Rolls", description: "Tender slow-cooked mutton wrapped in a delicate crepe, breaded and fried.", diet: ["Halal"] },
                { name: "Chicken Rolls", description: "Spiced minced chicken filled crepe rolls with a crispy golden crust.", diet: ["Halal"] },
            ]
        },
        {
            title: "Mains & Classics",
            description: "The heart of our kitchen. Traditional slow-cooked authentic Sri Lankan dishes.",
            items: [
                { name: "Traditional Lamprais", description: "A fragrant mixed meat curry, frikkadel (meatball), blachan, and seeni sambal, wrapped and baked in a banana leaf.", diet: ["Signature"] },
                { name: "Chicken Biryani", description: "Aromatic basmati rice cooked with rich spices, tender chicken, and served with cooling raita.", diet: ["Halal"] },
                { name: "Black Pork Curry", description: "Tender pieces of pork slow-cooked in roasted dark spices and tamarind until incredibly flavorful.", diet: [] },
                { name: "Chicken Devilled", description: "Spicy, sweet, and tangy stir-fried chicken with bell peppers, onions, and our signature sauce.", diet: ["Halal"] },
                { name: "Fish Ambulthiyal", description: "A unique dry fish curry made with goraka (garcinia cambogia), giving it a distinctive tart and peppery flavor.", diet: ["Halal"] },
                { name: "Garlic Prawns", description: "Jumbo prawns wok-tossed in a rich, buttery garlic and herb sauce.", diet: ["Seafood"] },
            ]
        },
        {
            title: "Sides & Vegetables",
            description: "Vibrant vegetable dishes that perfectly complement our rich mains.",
            items: [
                { name: "Brinjal Moju", description: "A sweet and sour eggplant pickle with mustard, vinegar, and green chilies. A quintessential side.", diet: ["Vegan", "GF"] },
                { name: "Cashew Curry", description: "Rich, creamy curry made with tender raw cashews, coconut milk, and mild spices.", diet: ["Vegan", "GF"] },
                { name: "Dhal Fry (Lentils)", description: "Red lentils tempered with mustard seeds, curry leaves, and garlic.", diet: ["Vegan", "GF"] },
                { name: "Potato Tempered", description: "Spicy and aromatic pan-fried potatoes infused with chili flakes and onions.", diet: ["Vegan", "GF"] },
                { name: "Polos Curry", description: "Young jackfruit slow-cooked until tender in a deeply spiced dark curry.", diet: ["Vegan", "GF"] },
            ]
        },
        {
            title: "Desserts",
            description: "Something sweet to conclude your feast.",
            items: [
                { name: "Cream Caramel", description: "A silky, smooth baked custard dessert topped with a layer of clear caramel sauce.", diet: ["Vegetarian"] },
                { name: "Pineapple Gateau", description: "Light sponge cake layered with fresh pineapple compote and rich cream.", diet: ["Vegetarian"] },
                { name: "Mango Mousse", description: "Light, airy, and bursting with the flavor of sweet tropical mangoes.", diet: ["Vegetarian"] },
                { name: "Fresh Fruit Platter", description: "A refreshing assortment of seasonal fresh cut fruits.", diet: ["Vegan", "GF"] },
            ]
        }
    ];

    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Header Banner */}
            <section className="bg-[color:var(--color-forest)] text-white py-24 px-6 relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-10 bg-repeat bg-center mix-blend-overlay"
                    style={{ backgroundImage: "url('/assets/img/lumprais-how-its-made-original.jpg')", backgroundSize: "cover" }}
                />
                <div className="max-w-4xl mx-auto relative z-10 text-center animate-fade-up">
                    <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-4">
                        Our Offerings
                    </span>
                    <h1 className="text-4xl md:text-6xl font-bold mb-6 drop-shadow-lg" style={{ fontFamily: "var(--font-serif)" }}>
                        Our Catering Menu
                    </h1>
                    <p className="text-lg md:text-xl text-[color:var(--color-cream-dark)] max-w-2xl mx-auto leading-relaxed opacity-90">
                        From intimate gatherings to grand celebrations, our menu brings the vibrant and authentic flavors of Sri Lanka to your table.
                    </p>
                </div>
            </section>

            {/* Menu Categories */}
            <section className="py-20 px-6 max-w-5xl mx-auto">
                <div className="flex flex-col gap-24">
                    {menuCategories.map((category, catIdx) => (
                        <div key={catIdx} className={`animate-fade-up delay-${(catIdx % 3) * 100}`}>
                            <div className="mb-10 text-center md:text-left border-b border-[color:var(--color-border)] pb-6">
                                <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-3" style={{ fontFamily: "var(--font-serif)" }}>
                                    {category.title}
                                </h2>
                                <p className="text-[color:var(--color-muted)] text-lg">
                                    {category.description}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                                {category.items.map((item, itemIdx) => (
                                    <div key={itemIdx} className="group">
                                        <div className="flex items-baseline justify-between mb-2">
                                            <h3 className="text-xl font-bold text-[color:var(--color-forest)] group-hover:text-[color:var(--color-sage)] transition-colors" style={{ fontFamily: "var(--font-serif)" }}>
                                                {item.name}
                                            </h3>
                                            {item.diet.length > 0 && (
                                                <div className="flex gap-2 ml-4">
                                                    {item.diet.map(marker => (
                                                        <span
                                                            key={marker}
                                                            className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-[color:var(--color-cream-dark)] text-[color:var(--color-bark)] rounded-full"
                                                        >
                                                            {marker}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[color:var(--color-muted)] text-sm leading-relaxed">
                                            {item.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Call to Action */}
            <section className="bg-[color:var(--color-cream-dark)] py-24 px-6 mb-12">
                <div className="max-w-3xl mx-auto text-center animate-fade-up">
                    <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                        See something you like for your next event?
                    </h2>
                    <p className="text-lg text-[color:var(--color-muted)] mb-10 max-w-xl mx-auto">
                        Let us handle the food for your next gathering. Request a custom quote and we&apos;ll help you craft the perfect menu.
                    </p>
                    <Link
                        href="/catering-request"
                        className="inline-block bg-[color:var(--color-sage)] text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                    >
                        Request Catering
                    </Link>
                </div>
            </section>
        </main>
    );
}
