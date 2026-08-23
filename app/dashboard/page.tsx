import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardHeader } from "@/components/Card";
import { SettingsRow } from "@/components/SettingsRow";
import { Badge } from "@/components/Primitives";
import { authOptions } from "@/lib/auth";
import { getUserSettings } from "@/lib/redis/settings";
import { getUserToken } from "@/lib/redis/tokens";
import { listUnprocessedApplications } from "@/lib/gmail/messages";
import { getGmailClientForUser } from "@/lib/gmail/client";

type ApplicationRow = {
  id: string;
  title: string;
  description: string;
  pending: boolean;
};

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string {
  const match = headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase()
  );
  return match?.value ?? "";
}

async function fetchProcessedRows(
  refreshToken: string,
  processedLabelName: string
): Promise<ApplicationRow[]> {
  const gmail = getGmailClientForUser(refreshToken);

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: `label:${processedLabelName}`,
    maxResults: 20
  });

  const rows: ApplicationRow[] = [];

  for (const item of listResponse.data.messages ?? []) {
    const id = item.id;
    if (!id) {
      continue;
    }
    try {
      const response = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Subject", "From"]
      });
      const headers = response.data.payload?.headers ?? [];
      rows.push({
        id,
        title: headerValue(headers, "Subject") || "(no subject)",
        description: headerValue(headers, "From") || "unknown sender",
        pending: false
      });
    } catch (error) {
      console.error(`[dashboard] failed to fetch message ${id}:`, error);
    }
  }

  return rows;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }
  const userId = session.user?.id;
  if (!userId) {
    redirect("/");
  }

  const [settings, token] = await Promise.all([
    getUserSettings(userId),
    getUserToken(userId)
  ]);

  let pendingRows: ApplicationRow[] = [];
  let repliedRows: ApplicationRow[] = [];

  if (token) {
    try {
      const messages = await listUnprocessedApplications(
        token.refreshToken,
        settings.jobLabelName,
        settings.processedLabelName
      );
      pendingRows = messages.map((message) => ({
        id: message.id,
        title: message.subject || "(no subject)",
        description: message.fromHeader || "unknown sender",
        pending: true
      }));
    } catch (error) {
      console.error("[dashboard] failed to list unprocessed applications:", error);
    }

    try {
      repliedRows = await fetchProcessedRows(
        token.refreshToken,
        settings.processedLabelName
      );
    } catch (error) {
      console.error("[dashboard] failed to list processed applications:", error);
    }
  }

  const rows = [...pendingRows, ...repliedRows];

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <Card>
          <CardHeader title="Applications" />
          <div>
            {rows.length === 0 ? (
              <p className="px-5 py-6 text-body text-text-muted">
                No applications yet. New emails labeled &apos;
                {settings.jobLabelName}&apos; in Gmail will appear here within 5
                minutes.
              </p>
            ) : (
              rows.map((row, index) => (
                <SettingsRow
                  key={row.id}
                  title={row.title}
                  description={row.description}
                  last={index === rows.length - 1}
                >
                  {row.pending ? (
                    <Badge tone="danger">Pending</Badge>
                  ) : (
                    <Badge tone="success">Replied</Badge>
                  )}
                </SettingsRow>
              ))
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
