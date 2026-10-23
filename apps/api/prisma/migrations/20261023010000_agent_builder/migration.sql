-- CreateTable
CREATE TABLE "agent_blueprint" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "graph" JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[]}',
    "prompt" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" UUID NOT NULL,
    "blueprint_id" UUID NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trace" JSONB NOT NULL DEFAULT '[]',
    "state" JSONB,
    "output" JSONB,
    "error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_blueprint_updated_at_idx" ON "agent_blueprint"("updated_at");

-- CreateIndex
CREATE INDEX "agent_run_blueprint_id_created_at_idx" ON "agent_run"("blueprint_id", "created_at");

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "agent_blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
