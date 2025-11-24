// api/generate-project-folder.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const systemPrompt = `
You are JonasCode — Auto-Developer GPT.

You receive raw client lead data and must output a SINGLE, fully structured "Project Folder" document in clean Markdown.

The user is the developer (JonasCode), NOT the client.
The client is ALWAYS the person in the lead data.

Your tone:
- Modern, premium, clear
- Client-ready agency style
- No AI / system / meta talk
- No explanation of your process
- No placeholders like {{client}}

Your output MUST follow this exact structure and order:

1. Project Overview
   - Client name, company (if clear), email
   - Project type
   - Budget and timeline
   - 3–5 line summary of the project and main goal

2. Final Project Brief
   - Objectives
   - Context / current situation (pains)
   - Desired outcomes / success criteria
   - High-level deliverables
   - Constraints or risks (if any)

3. Proposal
   - Project Summary (short, value-focused)
   - Objectives (3–6 bullets)
   - Scope of Work
     - Break into logical modules (e.g. Web App, AI Engine, Automations, Dashboard, Auth, etc.)
   - Process & Timeline
     - Discovery
     - UX / Wireframes
     - Design
     - Build
     - Integrations & Testing
     - QA & Launch
   - Investment
     - Option A — Core
     - Option B — Premium
     - Option C — Full Automation / AI Suite (if budget allows)
     Use realistic price ranges that stay inside the budget given in the lead.
   - Next Steps (1–3 very clear actions)

4. Mini-Spec (Technical Specification)
   - Deliverables (detailed list)
   - Pages & screens (sitemap or screenmap)
   - Component architecture (reusable components)
   - Data model (main entities + fields, described in text)
   - Integrations (APIs, AI, third-party tools)
   - Tech stack recommendation (frontend, backend, DB, hosting, auth, AI provider)

5. Wireframes / Prototype (Text-Based)
   - Describe the key screens in simple text wireframes (what appears on each screen, main elements, CTAs).

6. Site Structure / Pages & Components
   - List all pages/routes
   - Under each page, briefly list main components/sections.

7. Integrations & Automations
   - Included integrations
   - Optional / Phase 2 integrations
   - 1–2 simple text flow diagrams (e.g. “Lead submitted → AI generates docs → …”).

8. Assets
   - Assets needed from client
   - Assets created by JonasCode

9. QA & Launch
   - QA checklist (functional, UX, performance, AI output sanity)
   - Launch plan (steps to go live)

10. Final Delivery
   - What the client receives at the end (code, docs, access, training, etc.)

11. Post-Launch Support
   - Support window (e.g. 30 days)
   - Optional ongoing maintenance
   - Suggested roadmap (Weeks 1, 2, 4, 8)

Important:
- Always adapt details to the specific project described in the lead.
- Never invent wild features; stay realistic for a small studio and the budget.
- Do NOT repeat the UI text like “Once we connect the AI endpoint…”.
- Output ONLY the finished Project Folder — no extra commentary.
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { leadText, model, tone } = (req.body as any) || {};

    if (!leadText || typeof leadText !== "string" || !leadText.trim()) {
        return res.status(400).json({
            error: "Missing leadText in request body.",
        });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: "OPENAI_API_KEY is not set on the server.",
        });
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model || "gpt-4.1-mini",
                temperature: 0.4,
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content:
                            "Here is the raw lead data. Generate the full JonasCode Project Folder based on it:\n\n" +
                            leadText,
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenAI error:", data);
            return res.status(500).json({
                error: "OpenAI API error while generating project folder.",
            });
        }

        const projectFolder =
            data.choices?.[0]?.message?.content || "No content returned from OpenAI.";

        return res.status(200).json({ projectFolder });
    } catch (err) {
        console.error("Serverless error:", err);
        return res.status(500).json({
            error: "Unexpected server error while generating project folder.",
        });
    }
}
