import Link from "next/link";

export const metadata = {
    title: "About Us | Loku Caters",
    description: "Learn about the story behind Loku Caters and our commitment to authentic Sri Lankan cuisine.",
};

export default function AboutPage() {
    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Hero Section */}
            <section className="relative bg-[color:var(--color-forest)] text-white py-32 px-6 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-20 mix-blend-overlay bg-cover bg-center"
                    style={{ backgroundImage: "url('/assets/img/lumprais-how-its-made-original.jpg')" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--color-forest)] to-transparent opacity-90" />

                <div className="max-w-4xl mx-auto relative z-10 text-center animate-fade-up">
                    <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-4">
                        Our Story
                    </span>
                    <h1 className="text-4xl md:text-6xl font-bold mb-6 drop-shadow-lg" style={{ fontFamily: "var(--font-serif)" }}>
                        Rooted in Tradition
                    </h1>
                    <p className="text-lg md:text-2xl text-[color:var(--color-cream-dark)] max-w-2xl mx-auto font-medium opacity-90">
                        Bringing the authentic, vibrant flavors of Sri Lanka to your table.
                    </p>
                </div>
            </section>

            {/* The Origin Story */}
            <section className="py-24 px-6 bg-white">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-16 items-center">
                    <div className="md:w-1/2 animate-fade-up">
                        <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                            From Our Family to Yours
                        </h2>
                        <div className="flex flex-col gap-6 text-[color:var(--color-muted)] text-lg leading-relaxed">
                            <p>
                                Loku Caters was born out of a profound love for traditional Sri Lankan culinary art. We wanted to share the meals we grew up eating—meals that take time, patience, and a deep understanding of spices to create.
                            </p>
                            <p>
                                Our specialty, the Lamprais, is a labor of love. It&apos;s a complex dish that involves curating over half a dozen distinct elements, slow-cooking them to perfection, and baking them together in a banana leaf to let the flavors marry. It&apos;s more than just food; it&apos;s a cultural experience.
                            </p>
                            <p>
                                Today, we continue to prepare every meal in small batches, ensuring that the authenticity and quality of our heritage recipes are never compromised.
                            </p>
                        </div>
                    </div>
                    <div className="md:w-1/2 relative aspect-[4/5] w-full rounded-3xl overflow-hidden shadow-2xl animate-fade-up delay-200">
                        <div
                            className="absolute inset-0 bg-[color:var(--color-cream-dark)] bg-cover bg-center"
                            style={{ backgroundImage: "url('/assets/img/lumprais-how-its-made-original.jpg')" }}
                        >
                            {/* Fallback pattern if image is missing */}
                            <div className="absolute inset-0 bg-black/10 mix-blend-multiply" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Values / Process */}
            <section className="py-24 px-6 bg-[color:var(--color-cream-dark)]">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16 animate-fade-up">
                        <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
                            What We Stand For
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        {[
                            {
                                title: "Authenticity",
                                description: "We never take shortcuts. Our spice blends are roasted in-house, and our recipes stay true to their Sri Lankan roots."
                            },
                            {
                                title: "Quality Over Quantity",
                                description: "By exclusively cooking in small batches, we maintain strict control over the flavor and freshness of every dish we serve."
                            },
                            {
                                title: "Community First",
                                description: "Food is meant to be shared. We love bringing people together through our pop-up events and catering services."
                            }
                        ].map((value, idx) => (
                            <div key={idx} className={`bg-white p-10 rounded-3xl shadow-lg border border-[color:var(--color-border)] text-center animate-fade-up delay-${(idx + 1) * 100}`}>
                                <div className="w-16 h-16 bg-[color:var(--color-cream)] rounded-full flex items-center justify-center mx-auto mb-6 text-[color:var(--color-forest)]">
                                    {idx === 0 && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                    {idx === 1 && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
                                    {idx === 2 && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>}
                                </div>
                                <h3 className="text-xl font-bold text-[color:var(--color-forest)] mb-4" style={{ fontFamily: "var(--font-serif)" }}>{value.title}</h3>
                                <p className="text-[color:var(--color-muted)] leading-relaxed">
                                    {value.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 px-6 bg-white text-center">
                <div className="max-w-3xl mx-auto animate-fade-up">
                    <h2 className="text-3xl md:text-5xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                        Taste the Tradition
                    </h2>
                    <p className="text-lg text-[color:var(--color-muted)] mb-10 max-w-xl mx-auto">
                        Ready to experience authentic Sri Lankan cuisine? Browse our menu or request catering for your next event.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href="/menu"
                            className="bg-[color:var(--color-forest)] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-sage)] transition-colors shadow-lg"
                        >
                            Explore Menu
                        </Link>
                        <Link
                            href="/catering-request"
                            className="bg-[color:var(--color-cream-dark)] text-[color:var(--color-forest)] px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-sage)] hover:text-white transition-colors border border-[color:var(--color-border)] shadow-md"
                        >
                            Request Catering
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}
