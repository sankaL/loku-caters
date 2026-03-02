"use client";

import { useState } from "react";
import Link from "next/link";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";

const subjects = [
    { value: "general_question", label: "General Question" },
    { value: "feedback", label: "Feedback" },
    { value: "collaboration", label: "Collaboration" },
    { value: "other", label: "Other" },
];

export default function ContactPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorDetails, setErrorDetails] = useState<string | null>(null);
    const [selectedSubject, setSelectedSubject] = useState(subjects[0].value);
    const selectedSubjectOption = subjects.find((subject) => subject.value === selectedSubject) ?? subjects[0];

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorDetails(null);

        const formData = new FormData(e.currentTarget);
        const payload = {
            origin: "contact_us",
            feedback_type: selectedSubject,
            name: formData.get("name") as string,
            contact: formData.get("email") as string, // Backend accepts contact string
            message: formData.get("message") as string,
        };

        try {
            const resp = await fetch(`${API_URL}/api/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                throw new Error("Failed to send message");
            }

            const data = await resp.json();
            if (data.success) {
                setIsSuccess(true);
                captureEvent("contact_form_submitted", {
                    origin: "contact_us",
                    feedback_type: selectedSubject,
                });
            } else {
                throw new Error("Submission failed on server");
            }
        } catch (err) {
            console.error(err);
            setErrorDetails("Something went wrong attempting to send your message. Please email us directly.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="flex-1 bg-[color:var(--color-cream)]">
            {/* Header */}
            <section className="bg-[color:var(--color-forest)] text-white py-20 px-6 text-center">
                <div className="max-w-3xl mx-auto animate-fade-up">
                    <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-4">
                        Get in Touch
                    </span>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: "var(--font-serif)" }}>
                        Contact Us
                    </h1>
                    <p className="text-lg opacity-90 text-[color:var(--color-cream-dark)] max-w-xl mx-auto">
                        Whether you have a question about an order, want to collaborate, or just want to say hi, we&apos;d love to hear from you.
                    </p>
                </div>
            </section>

            <section className="py-16 px-6">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-16">

                    {/* Contact Information */}
                    <div className="md:w-1/3 flex flex-col gap-8 animate-fade-up delay-100">
                        <div>
                            <h2 className="text-2xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                                Contact Information
                            </h2>
                            <p className="text-[color:var(--color-muted)] mb-8 leading-relaxed">
                                Reach out to us directly or use the contact form. We strive to reply to all inquiries within 24 hours.
                            </p>
                        </div>

                        <div className="flex flex-col gap-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[color:var(--color-forest)] shrink-0 shadow-sm border border-[color:var(--color-border)] mt-1">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                </div>
                                <div>
                                    <strong className="block text-[color:var(--color-forest)] font-semibold mb-1">Email</strong>
                                    <a href="mailto:lokucaters@gmail.com" className="text-[color:var(--color-sage)] hover:text-[color:var(--color-forest)] transition-colors">
                                        lokucaters@gmail.com
                                    </a>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[color:var(--color-forest)] shrink-0 shadow-sm border border-[color:var(--color-border)] mt-1">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                </div>
                                <div>
                                    <strong className="block text-[color:var(--color-forest)] font-semibold mb-1">Phone</strong>
                                    <a href="tel:+16478301812" className="text-[color:var(--color-sage)] hover:text-[color:var(--color-forest)] transition-colors">
                                        +1 (647) 830-1812
                                    </a>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[color:var(--color-forest)] shrink-0 shadow-sm border border-[color:var(--color-border)] mt-1">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                </div>
                                <div>
                                    <strong className="block text-[color:var(--color-forest)] font-semibold mb-1">Kitchen Location</strong>
                                    <p className="text-[color:var(--color-muted)]">
                                        Welland, ON<br />
                                        (Pickup locations vary by pop-up event)
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[color:var(--color-cream-dark)] p-6 rounded-2xl border border-[color:var(--color-border)] mt-4">
                            <strong className="block text-[color:var(--color-forest)] font-bold mb-2">Looking for catering?</strong>
                            <p className="text-sm text-[color:var(--color-muted)] mb-4">
                                For detailed quotes and event menus, please use our dedicated catering request form.
                            </p>
                            <Link href="/catering-request" className="text-[color:var(--color-sage)] font-semibold text-sm hover:text-[color:var(--color-forest)] inline-flex items-center gap-1 transition-colors">
                                Go to Catering Form
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </Link>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="md:w-2/3 animate-fade-up delay-200">
                        {isSuccess ? (
                            <div className="bg-white p-12 rounded-3xl shadow-lg border border-[color:var(--color-border)] text-center h-full flex flex-col justify-center items-center">
                                <div className="w-16 h-16 bg-[color:var(--color-success-bg)] text-[color:var(--color-success-text)] rounded-full flex items-center justify-center mb-6">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-[color:var(--color-forest)] mb-4" style={{ fontFamily: "var(--font-serif)" }}>Message Sent!</h2>
                                <p className="text-[color:var(--color-muted)] mb-8">
                                    Thanks for reaching out. We&apos;ve received your message and will get back to you as soon as possible.
                                </p>
                                <button
                                    onClick={() => setIsSuccess(false)}
                                    className="bg-[color:var(--color-sage)] text-white px-8 py-3 rounded-full font-bold hover:bg-[color:var(--color-forest)] transition-colors"
                                >
                                    Send Another Message
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-[color:var(--color-border)] relative">
                                <h2 className="text-2xl font-bold text-[color:var(--color-forest)] mb-6" style={{ fontFamily: "var(--font-serif)" }}>
                                    Send a Message
                                </h2>

                                {errorDetails && (
                                    <div className="mb-6 p-4 bg-[color:var(--color-error-bg)] text-[color:var(--color-error-text)] rounded-xl border border-[color:var(--color-error-border)] text-sm font-medium">
                                        {errorDetails}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="flex flex-col gap-2">
                                            <label htmlFor="name" className="text-sm font-semibold text-[color:var(--color-text)]">Your Name *</label>
                                            <input required type="text" id="name" name="name" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label htmlFor="email" className="text-sm font-semibold text-[color:var(--color-text)]">Email Address *</label>
                                            <input required type="email" id="email" name="email" className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white transition-colors" />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label id="listbox-label" className="text-sm font-semibold text-[color:var(--color-text)]">Subject *</label>
                                        <Listbox value={selectedSubject} onChange={setSelectedSubject} name="subject">
                                            <div className="relative">
                                                <ListboxButton aria-labelledby="listbox-label" className="relative w-full cursor-pointer rounded-xl bg-[color:var(--color-cream)] py-3 pl-3 pr-10 text-left border border-[color:var(--color-border)] focus:outline-none data-[focus]:border-[color:var(--color-sage)] data-[focus]:bg-white transition-colors">
                                                    <span className="block truncate">{selectedSubjectOption.label}</span>
                                                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                                        <svg className="h-5 w-5 text-[color:var(--color-muted)]" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
                                                        </svg>
                                                    </span>
                                                </ListboxButton>
                                                <ListboxOptions className="absolute mt-2 max-h-60 w-full overflow-auto rounded-xl bg-white py-2 text-base shadow-lg ring-1 ring-[#0000000d] focus:outline-none z-10 border border-[color:var(--color-border)]">
                                                    {subjects.map((subject) => (
                                                        <ListboxOption
                                                            key={subject.value}
                                                            className="group relative cursor-pointer select-none py-3 pl-10 pr-4 data-[focus]:bg-[color:var(--color-cream-dark)] data-[focus]:text-[color:var(--color-forest)] text-[color:var(--color-muted)] transition-colors"
                                                            value={subject.value}
                                                        >
                                                            <span className="block truncate font-medium group-data-[selected]:font-bold group-data-[selected]:text-[color:var(--color-forest)]">
                                                                {subject.label}
                                                            </span>
                                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[color:var(--color-sage)] group-data-[selected]:opacity-100 opacity-0 transition-opacity">
                                                                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                                                </svg>
                                                            </span>
                                                        </ListboxOption>
                                                    ))}
                                                </ListboxOptions>
                                            </div>
                                        </Listbox>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label htmlFor="message" className="text-sm font-semibold text-[color:var(--color-text)]">Message *</label>
                                        <textarea required id="message" name="message" rows={6} className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white resize-y transition-colors"></textarea>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="mt-2 w-full bg-[color:var(--color-forest)] text-white py-4 rounded-xl font-bold text-lg hover:bg-[color:var(--color-sage)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
                                    >
                                        {isSubmitting ? "Sending..." : "Send Message"}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>

                </div>
            </section>
        </main>
    );
}
