import AgentsPageClient from "./AgentsPageClient";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { ensureProjectAgents } from "@/server/repositories/agents-repo";
import { getToolingCatalogSnapshot } from "@/server/services/tooling-catalog-service";
import { getAgentEvalGuardSnapshot } from "@/server/services/agent-eval-guard-service";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const agents = ensureProjectAgents(user.id, project.id);
  const toolingCatalog = await getToolingCatalogSnapshot();
  const evalGuard = await getAgentEvalGuardSnapshot();

  return (
    <AgentsPageClient
      initialProject={{
        id: project.id,
        name: project.name,
        relativePath: project.relativePath,
      }}
      initialAgents={agents}
      toolingCatalog={toolingCatalog}
      evalGuard={evalGuard}
    />
  );
}
