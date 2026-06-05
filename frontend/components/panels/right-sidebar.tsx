"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIPanel } from "@/components/panels/ai-panel";
import { KnowledgePanel } from "@/components/panels/knowledge-panel";

export function RightSidebar() {
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l bg-background">
      <Tabs defaultValue="ai" className="flex h-full flex-col">
        <div className="border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="ai" className="flex-1">AI</TabsTrigger>
            <TabsTrigger value="knowledge" className="flex-1">Knowledge</TabsTrigger>
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
