import {
  listPendingPipelineAdvanceSuggestions,
  loadPipelineClassificationCatalog,
} from "@/app/actions/pipeline-advance";
import { PipelineAdvanceSuggestionsList } from "./suggestions-list";

export const dynamic = "force-dynamic";

export default async function PipelineAdvanceSuggestionsPage() {
  const [{ items, canRunJob }, catalogResult] = await Promise.all([
    listPendingPipelineAdvanceSuggestions(),
    loadPipelineClassificationCatalog(),
  ]);
  const catalog = catalogResult.ok ? catalogResult.catalog : null;

  return (
    <PipelineAdvanceSuggestionsList items={items} canRunJob={canRunJob} catalog={catalog} />
  );
}
