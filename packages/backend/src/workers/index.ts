/**
 * Workers module exports
 *
 * Workers consume jobs from BullMQ queues and process them asynchronously.
 * Each container gets its own dedicated worker for processing Claude instructions.
 */

export * from './claude.worker'
