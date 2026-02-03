/**
 * Template Registry
 * Central registry for all container templates
 */

import { ContainerTemplate, TemplateListItem, TemplateCategory } from './types';
import { nodejsTemplate } from './nodejs.template';
import { pythonTemplate } from './python.template';
import { goTemplate } from './go.template';
import { rustTemplate } from './rust.template';
import { fullstackTemplate } from './fullstack.template';

/**
 * All available templates
 */
const templates: ContainerTemplate[] = [
  nodejsTemplate,
  pythonTemplate,
  goTemplate,
  rustTemplate,
  fullstackTemplate,
];

/**
 * Template registry map for fast lookup
 */
const templateMap: Map<string, ContainerTemplate> = new Map(
  templates.map((template) => [template.id, template])
);

/**
 * Get all available templates
 */
export function getAllTemplates(): ContainerTemplate[] {
  return [...templates];
}

/**
 * Get template list items (lightweight representation for API)
 */
export function getTemplateList(): TemplateListItem[] {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    category: template.category,
    tags: template.tags,
  }));
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ContainerTemplate | undefined {
  return templateMap.get(id);
}

/**
 * Check if template exists
 */
export function templateExists(id: string): boolean {
  return templateMap.has(id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): ContainerTemplate[] {
  return templates.filter((template) => template.category === category);
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): ContainerTemplate[] {
  const lowerTag = tag.toLowerCase();
  return templates.filter((template) =>
    template.tags.some((t) => t.toLowerCase().includes(lowerTag))
  );
}

/**
 * Search templates by query (searches name, description, and tags)
 */
export function searchTemplates(query: string): ContainerTemplate[] {
  const lowerQuery = query.toLowerCase();
  return templates.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Register a custom template
 */
export function registerTemplate(template: ContainerTemplate): void {
  if (templateMap.has(template.id)) {
    throw new Error(`Template with ID '${template.id}' already exists`);
  }
  templates.push(template);
  templateMap.set(template.id, template);
}

/**
 * Unregister a template
 */
export function unregisterTemplate(id: string): boolean {
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) {
    return false;
  }
  templates.splice(index, 1);
  templateMap.delete(id);
  return true;
}

// Re-export types
export * from './types';

// Re-export individual templates for direct access
export { nodejsTemplate } from './nodejs.template';
export { pythonTemplate } from './python.template';
export { goTemplate } from './go.template';
export { rustTemplate } from './rust.template';
export { fullstackTemplate } from './fullstack.template';
