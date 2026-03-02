import Image from "next/image";

export const metadata = {
    title: "About Us | Loku Caters",
    description: "Learn about the story behind Loku Caters and our commitment to authentic Sri Lankan cuisine.",
};

export default function AboutPage() {
    return (
        <main className="flex-1 bg-[color:var(--color-cream)] pb-24">
            {/* Our Story Section */}
            <section className="pt-32 pb-24 px-6 mt-10">
                <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24 items-center overflow-hidden py-4">
                    <div className="lg:w-1/2 animate-slide-in-left">
                        <h1 className="text-5xl md:text-7xl font-bold text-[color:var(--color-forest)] mb-10" style={{ fontFamily: "var(--font-serif)" }}>
                            Our Story
                        </h1>
                        <h2 className="text-2xl font-bold text-[color:var(--color-forest)] mb-6">
                            From Our Family to Yours
                        </h2>
                        <div className="flex flex-col gap-6 text-[color:var(--color-muted)] text-[17px] leading-relaxed max-w-[95%]">
                            <p>
                                Loku Caters was born from our family&apos;s passion for sharing authentic Sri Lankan flavors with our community in Canada. Led by professional chef Jayampathi Lokuliyana, whose culinary expertise spans both Sri Lanka and Canada, we started out by sharing our heritage recipes with our neighbors in Brampton. As excitement grew, our signature traditional Lamprais quickly became a local favorite.
                            </p>
                            <p>
                                Although the busy demands of life led us to take a seven-year break, retirement and popular demand have brought us back to the kitchen. We are thrilled to invite you on our renewed journey. We are still preparing our beloved recipes in small batches, and we cannot wait to share our food and bring people together once again.
                            </p>
                        </div>
                    </div>

                    <div className="lg:w-1/2 w-full animate-slide-in-right delay-200 lg:pl-4">
                        <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-2xl lg:scale-95 origin-right">
                            <Image
                                src="/assets/chef/chef-pic.jpg"
                                alt="Chef Jayampathi Lokuliyana"
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* What We Stand For Section */}
            <section className="px-6 mb-12">
                <div className="max-w-6xl mx-auto relative bg-[color:var(--color-forest)] rounded-3xl overflow-hidden p-12 md:p-20 shadow-2xl animate-fade-up">
                    {/* Decorative Background Elements */}
                    <div className="absolute -top-40 -left-20 w-80 h-80 bg-black/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-black/20 rounded-t-full pointer-events-none" />
                    <div className="absolute -top-10 -right-20 w-[400px] h-[400px] bg-black/20 rounded-full pointer-events-none" />

                    <div className="relative z-10">
                        <div className="text-center mb-16">
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                                What We Stand For
                            </h2>
                            <p className="text-[color:var(--color-cream-dark)] text-lg max-w-2xl mx-auto opacity-90">
                                We don&apos;t just provide food, we craft experiences centered around three core principles.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
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
                                <div key={idx} className={`animate-fade-up delay-${(idx + 1) * 100} px-2`}>
                                    <div className="w-16 h-16 bg-[#8B5E3C] rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-lg border border-white/10">
                                        {idx === 0 && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>}
                                        {idx === 1 && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>}
                                        {idx === 2 && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>}
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-4" style={{ fontFamily: "var(--font-serif)" }}>{value.title}</h3>
                                    <p className="text-[color:var(--color-cream-dark)] opacity-80 leading-relaxed text-sm">
                                        {value.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
