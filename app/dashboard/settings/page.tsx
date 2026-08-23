"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardHeader } from "@/components/Card";
import { SettingsRow } from "@/components/SettingsRow";
import { Button } from "@/components/Button";
import { Input } from "@/components/Primitives";

const textareaClasses =
  "bg-panel-2 border border-border rounded-control px-3 py-1.5 text-body text-text placeholder:text-text-faint w-full resize-y";

type SettingsForm = {
  jobLabelName: string;
  processedLabelName: string;
  hrPersonaPrompt: string;
};

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>({
    jobLabelName: "",
    processedLabelName: "",
    hrPersonaPrompt: ""
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/settings");
        const json = await response.json();
        if (!cancelled && response.ok && json.success && json.data) {
          setForm({
            jobLabelName: json.data.jobLabelName,
            processedLabelName: json.data.processedLabelName,
            hrPersonaPrompt: json.data.hrPersonaPrompt
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaveState(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const json = await response.json();
      if (response.ok && json.success) {
        setSaveState({ ok: true, message: "Changes saved." });
      } else {
        setSaveState({
          ok: false,
          message: json.error ?? "Something went wrong."
        });
      }
    } catch {
      setSaveState({ ok: false, message: "Network error. Try again." });
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <Card>
          <CardHeader title="Settings" />
          <div>
            <SettingsRow
              title="Job label"
              description="Gmail label that marks incoming applications."
            >
              <Input
                value={form.jobLabelName}
                onChange={(event) =>
                  setForm({ ...form, jobLabelName: event.target.value })
                }
                className="w-56"
              />
            </SettingsRow>
            <SettingsRow
              title="Processed label"
              description="Applied after a reply is sent. Emails with it are skipped."
            >
              <Input
                value={form.processedLabelName}
                onChange={(event) =>
                  setForm({ ...form, processedLabelName: event.target.value })
                }
                className="w-56"
              />
            </SettingsRow>
            <SettingsRow
              title="AI persona prompt"
              description="Tone and instructions injected into the AI reply prompt."
            >
              <textarea
                rows={4}
                value={form.hrPersonaPrompt}
                onChange={(event) =>
                  setForm({ ...form, hrPersonaPrompt: event.target.value })
                }
                className={`w-[420px] ${textareaClasses}`}
              />
            </SettingsRow>
          </div>
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3">
            {saveState ? (
              <span
                className={`text-sub ${saveState.ok ? "text-success" : "text-danger"}`}
              >
                {saveState.message}
              </span>
            ) : null}
            <Button variant="accent" onClick={handleSave} disabled={loading}>
              Save changes
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
