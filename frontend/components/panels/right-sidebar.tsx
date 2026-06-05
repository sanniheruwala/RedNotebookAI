"use client";

import * as React from "react";
import { BookMarked, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIPanel } from "@/components/panels/ai-panel";
import { KnowledgePanel } from "@/components/panels/knowledge-panel";

export function RightSidebar() {
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l bg-background/40">
      <Tabs defaultValue="ai" className="flex h-full flex-col">
        <div className="border-b px-3 py-2">
          <TabsList className="grid w-full grid-cols-2 bg-muted/40 p-0.5">
            <TabsTrigger value="ai" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> AI
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1.5 text-xs">
              <BookMarked className="h-3.5 w-3.5" /> Knowledge
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="ai" className="m-0 flex-1 overflow-hidden">
          <AIPanel />
        </TabsContent>
        <TabsContent value="knowledge" className="m-0 flex-1 overflow-hidden">
          <KnowledgePanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
