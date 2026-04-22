-- Phase 1: extend LifeEventType for richer genealogy vocabulary (PostgreSQL enum).
ALTER TYPE "LifeEventType" ADD VALUE IF NOT EXISTS 'BAPTISM';
ALTER TYPE "LifeEventType" ADD VALUE IF NOT EXISTS 'CENSUS';
ALTER TYPE "LifeEventType" ADD VALUE IF NOT EXISTS 'MILITARY';
