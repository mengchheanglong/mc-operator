import AgentsPageClient from "./AgentsPageClient";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { ensureProjectAgents } from "@/server/repositories/agents-repo";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const agents = ensureProjectAgents(user.id, project.id);

  return (
    <AgentsPageClient
      initialProject={{
        id: project.id,
        name: project.name,
        relativePath: project.relativePath,
      }}
      initialAgents={agents}
    />
  );
}
