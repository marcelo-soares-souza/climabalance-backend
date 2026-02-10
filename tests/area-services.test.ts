import { expect, test, describe, beforeEach } from 'bun:test';
import { Area } from '../src/domain/areas/entities/area';
import { AreaCriterion } from '../src/domain/areas/entities/area-criterion';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { AuditStatus } from '../src/domain/areas/value-objects/audit-status';
import { Location } from '../src/domain/areas/value-objects/location';
import { Biome } from '../src/domain/areas/value-objects/biome';
import { CarbonCapacity } from '../src/domain/areas/value-objects/carbon-capacity';
import { CarbonStockService } from '../src/domain/areas/services/carbon-stock.service';
import { AreaAuditService } from '../src/domain/areas/services/area-audit.service';
import type { AreaRepository } from '../src/domain/areas/repositories/area-repository';
import type { AreaCriteriaRepository } from '../src/domain/areas/repositories/area-criteria-repository';

// Mock repositories
class MockAreaRepository implements Partial<AreaRepository> {
  private areas: Map<string, Area> = new Map();

  async save(area: Area): Promise<void> {
    this.areas.set(area.id, area);
  }

  async findById(id: string): Promise<Area | null> {
    return this.areas.get(id) || null;
  }

  async update(area: Area): Promise<void> {
    this.areas.set(area.id, area);
  }

  reset() {
    this.areas.clear();
  }
}

class MockAreaCriteriaRepository implements Partial<AreaCriteriaRepository> {
  private criteria: AreaCriterion[] = [];

  async save(criterion: AreaCriterion): Promise<void> {
    this.criteria.push(criterion);
  }

  async saveMany(criteria: AreaCriterion[]): Promise<void> {
    this.criteria.push(...criteria);
  }

  async findByAreaId(areaId: string): Promise<AreaCriterion[]> {
    return this.criteria.filter(c => c.areaId === areaId);
  }

  reset() {
    this.criteria = [];
  }
}

class MockAuditLog {
  logs: any[] = [];

  async log(entry: any): Promise<void> {
    this.logs.push(entry);
  }

  reset() {
    this.logs = [];
  }
}

class MockClock {
  private currentDate = new Date('2026-02-02T12:00:00Z');

  now(): Date {
    return this.currentDate;
  }

  setDate(date: Date) {
    this.currentDate = date;
  }
}

describe('CarbonStockService', () => {
  let areaRepository: MockAreaRepository;
  let carbonStockService: CarbonStockService;
  let testArea: Area;

  beforeEach(() => {
    areaRepository = new MockAreaRepository();
    carbonStockService = new CarbonStockService({
      areaRepository: areaRepository as AreaRepository,
    });

    // Create test area with capacity
    testArea = new Area({
      id: 'area-1',
      ownerUserId: 'user-1',
      name: 'Test Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.ACTIVE,
      carbonCapacity: new CarbonCapacity(100, 0),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    areaRepository.save(testArea);
  });

  test('should reserve carbon stock successfully', async () => {
    await carbonStockService.reserveStock('area-1', 25);

    const area = await areaRepository.findById('area-1');
    expect(area).not.toBeNull();
    expect(area!.carbonCapacity?.committedTCO2e).toBe(25);
    expect(area!.carbonCapacity?.availableTCO2e).toBe(75);
  });

  test('should allow over-commitment beyond available capacity', async () => {
    // Reserve more than the total capacity (100 tCO2e)
    await carbonStockService.reserveStock('area-1', 150);

    const area = await areaRepository.findById('area-1');
    expect(area).not.toBeNull();
    expect(area!.carbonCapacity?.committedTCO2e).toBe(150);
    // Available becomes negative but is clamped in some contexts
    expect(area!.carbonCapacity?.availableTCO2e).toBe(-50);
  });

  test('should release carbon stock successfully', async () => {
    // First reserve some stock
    await carbonStockService.reserveStock('area-1', 30);

    // Then release part of it
    await carbonStockService.releaseStock('area-1', 10);

    const area = await areaRepository.findById('area-1');
    expect(area!.carbonCapacity?.committedTCO2e).toBe(20);
    expect(area!.carbonCapacity?.availableTCO2e).toBe(80);
  });

  test('should handle multiple reservations', async () => {
    await carbonStockService.reserveStock('area-1', 20);
    await carbonStockService.reserveStock('area-1', 30);
    await carbonStockService.reserveStock('area-1', 15);

    const area = await areaRepository.findById('area-1');
    expect(area!.carbonCapacity?.committedTCO2e).toBe(65);
    expect(area!.carbonCapacity?.availableTCO2e).toBe(35);
  });
});

describe('AreaAuditService', () => {
  let areaRepository: MockAreaRepository;
  let criteriaRepository: MockAreaCriteriaRepository;
  let auditLog: MockAuditLog;
  let clock: MockClock;
  let auditService: AreaAuditService;
  let testArea: Area;

  beforeEach(() => {
    areaRepository = new MockAreaRepository();
    criteriaRepository = new MockAreaCriteriaRepository();
    auditLog = new MockAuditLog();
    clock = new MockClock();

    auditService = new AreaAuditService({
      areaRepository: areaRepository as AreaRepository,
      criteriaRepository: criteriaRepository as AreaCriteriaRepository,
      auditLog,
      clock,
    });

    // Create draft area
    testArea = new Area({
      id: 'area-1',
      ownerUserId: 'user-1',
      name: 'Test Area',
      location: new Location(-15.7939, -47.8828),
      status: AreaStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    areaRepository.save(testArea);
  });

  test('should submit area for audit successfully', async () => {
    await auditService.submitForAudit('area-1', 'user-1');

    const area = await areaRepository.findById('area-1');
    expect(area!.status.toString()).toBe('pending_audit');
    expect(area!.auditStatus?.toString()).toBe('pending');
  });

  test('should fail to submit if user is not owner', async () => {
    expect(async () => {
      await auditService.submitForAudit('area-1', 'different-user');
    }).toThrow();
  });

  test('should approve area with criteria', async () => {
    // First submit for audit
    await auditService.submitForAudit('area-1', 'user-1');

    // Create criteria
    const criteria = [
      AreaCriterion.create({
        id: 'crit-1',
        areaId: 'area-1',
        criterionKey: 'legal_documentation',
        criterionLabel: 'Legal Documentation',
        met: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      AreaCriterion.create({
        id: 'crit-2',
        areaId: 'area-1',
        criterionKey: 'native_species',
        criterionLabel: 'Native Species',
        met: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];

    await auditService.approveArea('area-1', 'analyst-1', criteria, 'All criteria met');

    const area = await areaRepository.findById('area-1');
    expect(area!.status.toString()).toBe('approved');
    expect(area!.auditStatus?.toString()).toBe('approved');
    expect(area!.auditedByUserId).toBe('analyst-1');
    expect(area!.auditNotes).toBe('All criteria met');

    const savedCriteria = await criteriaRepository.findByAreaId('area-1');
    expect(savedCriteria.length).toBe(2);
    expect(auditLog.logs.length).toBe(2); // submitForAudit + approve
    expect(auditLog.logs[0].action).toBe('area.submitted_for_audit');
    expect(auditLog.logs[1].action).toBe('area.approved');
  });

  test('should fail to approve if not all criteria are met', async () => {
    await auditService.submitForAudit('area-1', 'user-1');

    const criteria = [
      AreaCriterion.create({
        id: 'crit-1',
        areaId: 'area-1',
        criterionKey: 'legal_documentation',
        criterionLabel: 'Legal Documentation',
        met: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      AreaCriterion.create({
        id: 'crit-2',
        areaId: 'area-1',
        criterionKey: 'native_species',
        criterionLabel: 'Native Species',
        met: false, // This one is not met
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];

    expect(async () => {
      await auditService.approveArea('area-1', 'analyst-1', criteria);
    }).toThrow();
  });

  test('should reject area with reason', async () => {
    await auditService.submitForAudit('area-1', 'user-1');

    await auditService.rejectArea('area-1', 'analyst-1', 'Documentation incomplete');

    const area = await areaRepository.findById('area-1');
    expect(area!.status.toString()).toBe('rejected');
    expect(area!.auditStatus?.toString()).toBe('rejected');
    expect(area!.auditedByUserId).toBe('analyst-1');
    expect(area!.auditNotes).toBe('Documentation incomplete');
    expect(auditLog.logs.length).toBe(2); // submitForAudit + reject
    expect(auditLog.logs[0].action).toBe('area.submitted_for_audit');
    expect(auditLog.logs[1].action).toBe('area.rejected');
  });

  test('should activate approved area', async () => {
    // Submit, approve, then activate
    await auditService.submitForAudit('area-1', 'user-1');

    const criteria = [
      AreaCriterion.create({
        id: 'crit-1',
        areaId: 'area-1',
        criterionKey: 'legal_documentation',
        criterionLabel: 'Legal Documentation',
        met: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];

    await auditService.approveArea('area-1', 'analyst-1', criteria);
    await auditService.activateArea('area-1', 'analyst-1');

    const area = await areaRepository.findById('area-1');
    expect(area!.status.toString()).toBe('active');
  });

  test('should fail to activate non-approved area', async () => {
    expect(async () => {
      await auditService.activateArea('area-1', 'analyst-1');
    }).toThrow();
  });
});
