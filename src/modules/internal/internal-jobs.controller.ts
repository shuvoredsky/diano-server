import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { INTERNAL_JOB_NAMES, type InternalJobName } from './internal-jobs.types';
import { internalJobsService, type InternalJobsService } from './internal-jobs.service';

export class InternalJobsController {
  constructor(private readonly service: InternalJobsService = internalJobsService) {}

  triggerJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name } = req.params;

      if (!name || !INTERNAL_JOB_NAMES.includes(name as InternalJobName)) {
        throw AppError.notFound(
          `Unknown internal job '${name}'. Allowed jobs: ${INTERNAL_JOB_NAMES.join(', ')}`,
        );
      }

      const result = await this.service.executeJob(name as InternalJobName);

      ApiResponse.success(
        res,
        result.status === 'SKIPPED_ALREADY_RUNNING'
          ? `Job '${name}' is already running, execution skipped`
          : `Job '${name}' executed successfully`,
        result,
        200,
      );
    } catch (error) {
      next(error);
    }
  };
}

export const internalJobsController = new InternalJobsController();
