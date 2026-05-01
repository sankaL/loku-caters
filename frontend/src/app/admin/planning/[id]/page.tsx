import PlanningEditorClient from "@/components/admin/planning/PlanningEditorClient";

export default async function PlanningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanningEditorClient planId={id} />;
}
