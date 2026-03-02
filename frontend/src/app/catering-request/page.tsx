"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";

export default function CateringRequestPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorDetails, setErrorDetails] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorDetails(null);

        const formData = new FormData(e.currentTarget);
        const payload = {
            first_name: formData.get("first_name") as string,
            last_name: formData.get("last_name") as string,
            email: formData.get("email") as string,
            phone_number: (formData.get("phone_number") as string) || null,
            event_date: formData.get("event_date") as string,
            guest_count: parseInt(formData.get("guest_count") as string, 10),
            event_type: formData.get("event_type") as string,
            budget_range: (formData.get("budget_range") as string) || null,
            special_requests: (formData.get("special_requests") as string) || null,
        };

        try {
            const resp = await fetch(`${API_URL}/api/catering-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                throw new Error("Failed to submit request");
            }

            const data = await resp.json();
            if (data.success) {
                setIsSuccess(true);
                captureEvent("catering_request_submitted", { event_type: payload.event_type, guest_count: payload.guest_count });
            } else {
                throw new Error("Submission failed on server");
            }
        } catch (err) {
            console.error(err);
            setErrorDetails("Something went wrong. Please try again or contact us directly.");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isSuccess) {
        return (
            <main className="flex-1 bg-[color:var(--color-cream)] flex items-center justify-center p-6">
                <div className="max-w-xl mx-auto text-center bg-white p-12 rounded-3xl border border-[color:var(--color-border)] shadow-xl animate-scale-in">
                    <div className="w-20 h-20 bg-[color:var(--color-success-bg)] text-[color:var(--color-success-text)] rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-[color:var(--color-forest)] mb-4" style={{ fontFamily: "var(--font-serif)" }}>
                        Request Received
                    </h1>
                    <p className="text-[color:var(--color-muted)] text-lg mb-8 leading-relaxed">
                        Thank you for reaching out to Loku Caters. We&apos;ve received your catering request and we&apos;ll be in touch with a custom quote shortly.
                    </p>
                    <Link
                        href="/"
                        className="inline-block bg-[color:var(--color-sage)] text-white px-8 py-3 rounded-full font-bold hover:bg-[color:var(--color-forest)] transition-colors"
                    >
                        Return Home
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Header */}
            <section className="bg-[color:var(--color-forest)] text-white py-20 px-6 text-center">
                <div className="max-w-3xl mx-auto animate-fade-up">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: "var(--font-serif)" }}>
                        Request Catering
                    </h1>
                    <p className="text-lg opacity-90 max-w-xl mx-auto text-[color:var(--color-cream-dark)]">
                        Let us handle the food for your next gathering. Fill out the details below, and we&apos;ll be in touch with a custom quote.
                    </p>
                </div>
            </section>

            <section className="py-16 px-6">
                <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16">

                    {/* Form Side */}
                    <div className="lg:w-3/5 bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-[color:var(--color-border)] animate-fade-up delay-100">
                        {errorDetails && (
                            <div className="mb-8 p-4 bg-[color:var(--color-error-bg)] text-[color:var(--color-error-text)] rounded-xl border border-[color:var(--color-error-border)] flex items-start gap-3">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                <p className="text-sm font-medium">{errorDetails}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="first_name" className="text-sm font-semibold text-[color:var(--color-text)]">First Name *</label>
                                    <input required type="text" id="first_name" name="first_name" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="last_name" className="text-sm font-semibold text-[color:var(--color-text)]">Last Name *</label>
                                    <input required type="text" id="last_name" name="last_name" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="email" className="text-sm font-semibold text-[color:var(--color-text)]">Email Address *</label>
                                    <input required type="email" id="email" name="email" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="phone_number" className="text-sm font-semibold text-[color:var(--color-text)]">Phone Number</label>
                                    <input type="tel" id="phone_number" name="phone_number" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="event_date" className="text-sm font-semibold text-[color:var(--color-text)]">Event Date *</label>
                                    <input required type="date" id="event_date" name="event_date" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="guest_count" className="text-sm font-semibold text-[color:var(--color-text)]">Estimated Guest Count *</label>
                                    <input required type="number" min="1" id="guest_count" name="guest_count" placeholder="e.g. 50" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="event_type" className="text-sm font-semibold text-[color:var(--color-text)]">Event Type *</label>
                                    <select required id="event_type" name="event_type" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white">
                                        <option value="">Select event type...</option>
                                        <option value="corporate">Corporate Event</option>
                                        <option value="wedding">Wedding</option>
                                        <option value="birthday">Birthday Party</option>
                                        <option value="private-dinner">Private Dinner</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="budget_range" className="text-sm font-semibold text-[color:var(--color-text)]">Budget Range</label>
                                    <select id="budget_range" name="budget_range" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white">
                                        <option value="">Select budget range...</option>
                                        <option value="under-500">Under CAD 500</option>
                                        <option value="500-1000">CAD 500 - 1,000</option>
                                        <option value="1000-2500">CAD 1,000 - 2,500</option>
                                        <option value="2500-5000">CAD 2,500 - 5,000</option>
                                        <option value="5000-plus">CAD 5,000+</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="special_requests" className="text-sm font-semibold text-[color:var(--color-text)]">Dietary Restrictions & Special Requests</label>
                                <textarea id="special_requests" name="special_requests" rows={4} placeholder="Please list any allergies, dietary needs, or specific menu requests..." className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white resize-y"></textarea>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="mt-4 w-full bg-[color:var(--color-forest)] text-white py-4 rounded-xl font-bold text-lg hover:bg-[color:var(--color-sage)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Submitting...
                                    </>
                                ) : (
                                    "Get a Quote"
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Sidebar */}
                    <div className="lg:w-2/5 flex flex-col gap-8 animate-fade-up delay-200">
                        <div className="bg-[color:var(--color-cream-dark)] p-8 rounded-3xl border border-[color:var(--color-border)]">
                            <h3 className="text-2xl font-bold text-[color:var(--color-forest)] mb-4" style={{ fontFamily: "var(--font-serif)" }}>Catering Menus</h3>
                            <p className="text-[color:var(--color-muted)] text-sm leading-relaxed mb-6">
                                From traditional lamprais to international buffet spreads, we offer customizable menus to fit your event perfectly.
                            </p>

                            <ul className="flex flex-col gap-4 mb-6">
                                <li className="flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-sage)] mt-1.5 shrink-0" />
                                    <div>
                                        <strong className="text-sm text-[color:var(--color-forest)] block">Standard Buffet Sets</strong>
                                        <span className="text-xs text-[color:var(--color-muted)] block">Complete meal packages tailored for 30+ guests.</span>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-sage)] mt-1.5 shrink-0" />
                                    <div>
                                        <strong className="text-sm text-[color:var(--color-forest)] block">Classic Curry Selection</strong>
                                        <span className="text-xs text-[color:var(--color-muted)] block">Build your own authentic spread with individual dishes.</span>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-sage)] mt-1.5 shrink-0" />
                                    <div>
                                        <strong className="text-sm text-[color:var(--color-forest)] block">Signature Lamprais</strong>
                                        <span className="text-xs text-[color:var(--color-muted)] block">Our specialty, individually wrapped portions. Minimum order of 20.</span>
                                    </div>
                                </li>
                            </ul>

                            <Link href="/menu" className="text-[color:var(--color-forest)] font-bold text-sm hover:text-[color:var(--color-sage)] transition-colors flex items-center gap-1">
                                View Full Menu
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </Link>
                        </div>

                        <div className="bg-white p-8 rounded-3xl border border-[color:var(--color-border)] flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-[color:var(--color-cream-dark)] rounded-full flex items-center justify-center mb-4 text-[color:var(--color-forest)]">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                            </div>
                            <h3 className="text-xl font-bold text-[color:var(--color-forest)] mb-2" style={{ fontFamily: "var(--font-serif)" }}>Direct Contact</h3>
                            <p className="text-[color:var(--color-muted)] text-sm mb-4">
                                Have immediate questions about catering? Give us a call or send us an email.
                            </p>
                            <a href="tel:+16478301812" className="text-[color:var(--color-forest)] font-bold mb-1 hover:text-[color:var(--color-sage)]">+1 (647) 830-1812</a>
                            <a href="mailto:lokucaters@gmail.com" className="text-[color:var(--color-forest)] font-bold hover:text-[color:var(--color-sage)]">lokucaters@gmail.com</a>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
