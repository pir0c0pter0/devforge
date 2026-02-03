import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAllTemplates,
  getTemplateList,
  getTemplateById,
  getTemplatesByCategory,
  getTemplatesByTag,
  searchTemplates,
  templateExists,
  TemplateCategory,
} from '../../templates';
import { containerService } from '../../services/container.service';
import { validateBody, validateParams, validateQuery } from '../../utils/validation';
import { apiLogger as logger } from '../../utils/logger';

const router: Router = Router();

/**
 * API response helper
 */
const successResponse = <T>(data: T, message?: string) => ({
  success: true,
  data,
  ...(message && { message }),
});

const errorResponse = (error: string, statusCode: number = 500) => ({
  success: false,
  error,
  statusCode,
});

/**
 * Template ID parameter schema
 */
const TemplateIdParamsSchema = z.object({
  id: z.string().min(1, 'Template ID is required'),
});

/**
 * List templates query schema
 */
const ListTemplatesQuerySchema = z.object({
  category: z
    .enum(['language', 'framework', 'fullstack', 'data-science', 'devops', 'custom'])
    .optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  detailed: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default('false'),
});

/**
 * Create container from template request schema
 */
const CreateFromTemplateRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Container name is required')
    .max(64, 'Container name must be 64 characters or less')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      'Container name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    ),
  mode: z.enum(['interactive', 'autonomous']).default('interactive'),
  repoType: z.enum(['empty', 'clone']).default('empty'),
  repoUrl: z.string().url().optional(),
  sshKeyPath: z.string().optional(),
  environment: z.record(z.string()).optional(),
  cpuLimit: z.number().min(0.5).max(16).optional(),
  memoryLimit: z.number().min(512).max(65536).optional(),
  diskLimit: z.number().min(1024).max(102400).optional(),
});

/**
 * GET /api/templates
 * List all templates with optional filtering
 */
router.get(
  '/',
  validateQuery(ListTemplatesQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { category, tag, search, detailed } = req.query as {
        category?: TemplateCategory;
        tag?: string;
        search?: string;
        detailed?: boolean;
      };

      logger.info({ category, tag, search, detailed }, 'Listing templates');

      let templates;

      if (search) {
        templates = detailed ? searchTemplates(search) : searchTemplates(search);
      } else if (category) {
        templates = getTemplatesByCategory(category);
      } else if (tag) {
        templates = getTemplatesByTag(tag);
      } else {
        templates = detailed ? getAllTemplates() : getTemplateList();
      }

      logger.info({ count: templates.length }, 'Templates listed successfully');

      res.json(successResponse(templates));
    } catch (error) {
      logger.error({ error }, 'Failed to list templates');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to list templates',
          500
        )
      );
    }
  }
);

/**
 * GET /api/templates/:id
 * Get template details by ID
 */
router.get(
  '/:id',
  validateParams(TemplateIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ templateId: id }, 'Getting template details');

      const template = getTemplateById(id);

      if (!template) {
        logger.warn({ templateId: id }, 'Template not found');
        res.status(404).json(errorResponse('Template not found', 404));
        return;
      }

      res.json(successResponse(template));
    } catch (error) {
      logger.error({ error, templateId: req.params['id'] }, 'Failed to get template');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get template',
          500
        )
      );
    }
  }
);

/**
 * POST /api/containers/from-template/:templateId
 * Create a new container from a template
 */
router.post(
  '/from-template/:templateId',
  validateParams(z.object({ templateId: z.string().min(1) })),
  validateBody(CreateFromTemplateRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const templateId = req.params['templateId'] as string;
      const requestBody = req.body;

      logger.info({ templateId, requestBody }, 'Creating container from template');

      // Validate template exists
      if (!templateExists(templateId)) {
        logger.warn({ templateId }, 'Template not found');
        res.status(404).json(errorResponse('Template not found', 404));
        return;
      }

      const template = getTemplateById(templateId);

      if (!template) {
        res.status(404).json(errorResponse('Template not found', 404));
        return;
      }

      // Create container using template
      const container = await containerService.createFromTemplate(templateId, {
        name: requestBody.name,
        mode: requestBody.mode,
        repoType: requestBody.repoType,
        repoUrl: requestBody.repoUrl,
        sshKeyPath: requestBody.sshKeyPath,
        environment: requestBody.environment,
        cpuLimit: requestBody.cpuLimit,
        memoryLimit: requestBody.memoryLimit,
        diskLimit: requestBody.diskLimit,
      });

      logger.info(
        { containerId: container.id, templateId },
        'Container created from template successfully'
      );

      res.status(201).json(
        successResponse(container, `Container created successfully from template '${template.name}'`)
      );
    } catch (error) {
      logger.error(
        { error, templateId: req.params['templateId'], body: req.body },
        'Failed to create container from template'
      );

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to create container from template',
          500
        )
      );
    }
  }
);

/**
 * GET /api/templates/categories
 * Get all available template categories
 */
router.get('/meta/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories: TemplateCategory[] = [
      'language',
      'framework',
      'fullstack',
      'data-science',
      'devops',
      'custom',
    ];

    res.json(
      successResponse(
        categories.map((category) => ({
          id: category,
          name: category
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          count: getTemplatesByCategory(category).length,
        }))
      )
    );
  } catch (error) {
    logger.error({ error }, 'Failed to get template categories');

    res.status(500).json(
      errorResponse(
        error instanceof Error ? error.message : 'Failed to get template categories',
        500
      )
    );
  }
});

/**
 * GET /api/templates/tags
 * Get all available template tags
 */
router.get('/meta/tags', async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = getAllTemplates();
    const tagCounts: Record<string, number> = {};

    templates.forEach((template) => {
      template.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const tags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    res.json(successResponse(tags));
  } catch (error) {
    logger.error({ error }, 'Failed to get template tags');

    res.status(500).json(
      errorResponse(
        error instanceof Error ? error.message : 'Failed to get template tags',
        500
      )
    );
  }
});

export default router;
