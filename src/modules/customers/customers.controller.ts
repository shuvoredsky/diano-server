import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { customersService, type CustomersService } from './customers.service';
import {
  listCustomersQuerySchema,
  updateCustomerProfileSchema,
  createAddressSchema,
  updateAddressSchema,
  updateConsentsSchema,
  createCustomerNoteSchema,
  updateCustomerStatusSchema,
} from './customers.validation';

export class CustomersController {
  constructor(private readonly service: CustomersService = customersService) {}

  private extractActorMeta(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id ? String(req.id) : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Customer Self-Service Endpoints
  // ---------------------------------------------------------------------------

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.service.getProfile(req.user!.userId);
    return ApiResponse.success(res, 'Customer profile retrieved', profile);
  };

  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    const input = updateCustomerProfileSchema.parse(req.body);
    const updated = await this.service.updateProfile(req.user!.userId, input);
    return ApiResponse.success(res, 'Customer profile updated', updated);
  };

  listAddresses = async (req: Request, res: Response): Promise<Response> => {
    const addresses = await this.service.listAddresses(req.user!.userId);
    return ApiResponse.success(res, 'Addresses retrieved', addresses);
  };

  addAddress = async (req: Request, res: Response): Promise<Response> => {
    const input = createAddressSchema.parse(req.body);
    const address = await this.service.addAddress(req.user!.userId, input);
    return ApiResponse.created(res, 'Address created', address);
  };

  updateAddress = async (req: Request, res: Response): Promise<Response> => {
    const addressId = req.params.addressId as string;
    const input = updateAddressSchema.parse(req.body);
    const address = await this.service.updateAddress(req.user!.userId, addressId, input);
    return ApiResponse.success(res, 'Address updated', address);
  };

  deleteAddress = async (req: Request, res: Response): Promise<Response> => {
    const addressId = req.params.addressId as string;
    await this.service.deleteAddress(req.user!.userId, addressId);
    return ApiResponse.success(res, 'Address deleted');
  };

  getConsents = async (req: Request, res: Response): Promise<Response> => {
    const consents = await this.service.getConsents(req.user!.userId);
    return ApiResponse.success(res, 'Consents retrieved', consents);
  };

  updateConsents = async (req: Request, res: Response): Promise<Response> => {
    const input = updateConsentsSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const consents = await this.service.updateConsents(req.user!.userId, input, meta);
    return ApiResponse.success(res, 'Consents updated', consents);
  };

  exportData = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.service.exportData(req.user!.userId);
    return ApiResponse.success(res, 'Personal data export generated', data);
  };

  deleteAccount = async (req: Request, res: Response): Promise<Response> => {
    const meta = this.extractActorMeta(req);
    await this.service.deleteAccount(req.user!.userId, meta);
    return ApiResponse.success(res, 'Account deleted and personal data anonymized');
  };

  // ---------------------------------------------------------------------------
  // Admin Customer Endpoints
  // ---------------------------------------------------------------------------

  listCustomers = async (req: Request, res: Response): Promise<Response> => {
    const query = listCustomersQuerySchema.parse(req.query);
    const result = await this.service.listCustomers(query);
    return ApiResponse.paginated(res, 'Customers retrieved successfully', result.items, result.meta);
  };

  getCustomerDetail = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const customer = await this.service.getCustomerDetail(id);
    return ApiResponse.success(res, 'Customer details retrieved', customer);
  };

  updateCustomerStatus = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const { status } = updateCustomerStatusSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    await this.service.updateCustomerStatus(id, status, req.user!, meta);
    return ApiResponse.success(res, `Customer status updated to ${status}`);
  };

  addCustomerNote = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const { note } = createCustomerNoteSchema.parse(req.body);
    const noteItem = await this.service.addCustomerNote(id, note, req.user!);
    return ApiResponse.created(res, 'Customer note added', noteItem);
  };

  getCustomerNotes = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const notes = await this.service.getCustomerNotes(id);
    return ApiResponse.success(res, 'Customer notes retrieved', notes);
  };

  getCustomerTimeline = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const timeline = await this.service.getCustomerTimeline(id);
    return ApiResponse.success(res, 'Customer timeline retrieved', timeline);
  };
}

export const customersController = new CustomersController();
