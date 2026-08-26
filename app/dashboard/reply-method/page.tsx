"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardHeader } from "@/components/Card";
import { SettingsRow } from "@/components/SettingsRow";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/Primitives";

type ReplyMethod = "gmail" | "resend";

export default function ReplyMethodPage() {
  const [replyMethod, setReplyMethod] = useState<ReplyMethod>("gmail");
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          setReplyMethod(json.data.replyMethod === "resend" ? "resend" : "gmail");
          setResendFromEmail(json.data.resendFromEmail ?? "");
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
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyMethod,
          resendFromEmail: resendFromEmail || undefined
        })
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <Card>
          <CardHeader title="Reply method" />
          <div>
            <SettingsRow
              title="Send replies via"
              description="Replies are sent from your Gmail account or via Resend."
            >
              <Select
                value={replyMethod}
                onChange={(event) =>
                  setReplyMethod(event.target.value as ReplyMethod)
                }
              >
                <option value="gmail">Gmail API</option>
                <option value="resend">Resend</option>
              </Select>
            </SettingsRow>
            {replyMethod === "resend" ? (
              <SettingsRow
                title="From email"
                description="Must be a verified sender in your Resend account."
              >
                <Input
                  type="email"
                  placeholder="you@yourdomain.com"
                  value={resendFromEmail}
                  onChange={(event) => setResendFromEmail(event.target.value)}
                  className="w-56"
                />
              </SettingsRow>
            ) : null}
          </div>
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3">
            {saveState ? (
              <span className={`text-sub ${saveState.ok ? "text-success" : "text-danger"}`}>
                {saveState.message}
              </span>
            ) : null}
            <Button
              variant="accent"
              onClick={handleSave}
              disabled={loading || saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
