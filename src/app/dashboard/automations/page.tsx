import AutomationsPageClient from "./AutomationsPageClient";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { listAutomationTemplates } from "@/server/repositories/automation-templates-repo";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const templates = listAutomationTemplates(user.id, project.id);

  return (
    <AutomationsPageClient
      initialProject={{
        id: project.id,
        name: project.name,
        relativePath: project.relativePath,
      }}
      initialTemplates={templates}
    />
  );
}
