# Email Subject-Template Pairing Implementation Plan

## Purpose

This plan implements a decentralized approach to email template management in the FiFi Alert backend, where each service/module is responsible for maintaining its own email templates and sending methods.

## Problem Statement

The current email system has all templates defined centrally in `baseEmailTemplateNames` in `email.service.ts`. This creates:
- Tight coupling between the email service and all application modules
- Difficult maintenance as the application grows
- Unclear ownership of email templates
- Hard to track which emails belong to which feature

## Solution Approach

Each service maintains its own `Record<string, IEmailTemplate>` registry and email-sending methods. When sending an email, the service instantiates `EmailService` with its local template list, providing better separation of concerns.

### Benefits

1. **Separation of Concerns**: Each service owns its email templates
2. **Maintainability**: Easy to find and update templates per feature
3. **Scalability**: New features can add emails without modifying shared code
4. **Testability**: Email methods can be tested independently per service
5. **Clarity**: Clear ownership and responsibility for each email type

## Pattern Overview

### 1. Define Local Template Registry
```typescript
// Inside your service file
const serviceEmailTemplates: Record<string, IEmailTemplate> = {
  templateName: {
    subject: 'Email Subject',
    file: 'notifications/email/module/template.njk',
  },
};
```

### 2. Create Email Sending Method
```typescript
async sendNotificationEmail(user: User, data: any): Promise<{ success: boolean; message: string }> {
  const emailService = new EmailService(
    this.emailProvider, // Injected via constructor
    this.eventEmitter,
    serviceEmailTemplates
  );
  
  try {
    await emailService.sendHtml('templateName', {
      from: process.env.MAIL_NOTIFICATIONS_FROM,
      to: user.email,
      templateData: { user, ...data },
    });
    
    return { success: true, message: 'Email sent' };
  } catch (error) {
    this.logger.error('Email error:', error);
    throw new Error('FAILED_TO_SEND_EMAIL');
  }
}
```

### 3. Integrate Into Service Flow
```typescript
async createAlert(userId: number, dto: CreateAlertDto) {
  // Business logic...
  const alert = await this.prisma.alert.create({ data: alertData });
  
  // Send notification email
  await this.sendAlertCreatedEmail(user, alert);
  
  return alert;
}
```

## Reference Implementation

See `src/user/user.service.ts` (lines 57-73) for the reference implementation pattern:
- Local template registry defined: `userServiceEmailTemplateNames`
- Template definitions for user-related emails
- Can be used as a model for other services

## Documentation

### Main Task List
See [tasks.md](./tasks.md) for the complete implementation task list organized by phase:
- Phase 1: User Service (reference implementation)
- Phase 2: Alert Service
- Phase 3: Sighting Service
- Phase 4: Auth/Token Service
- Phase 5: Shared Infrastructure
- Phase 6: Testing & Documentation
- Phase 7: Email Preferences (future)

### Architecture Decisions

**Q: Should we keep baseEmailTemplateNames?**
A: Consider migrating all templates to services. Keep only truly shared templates (if any) in base registry.

**Q: How do services access the email provider?**
A: Inject `EMAIL_PROVIDER` via constructor for cleaner code:
```typescript
constructor(
  @Inject('EMAIL_PROVIDER') private readonly emailProvider: IEmailProvider,
  private readonly eventEmitter: EventEmitter2,
) {}
```

**Q: Should we queue emails?**
A: For high-volume scenarios (alert notifications to many users), consider using BullMQ for email queuing.

## Files Overview

```
docs/plans/email-subject-template-pairing/
├── README.md (this file)          # Overview and architecture
└── tasks.md                       # Detailed task list

src/
├── notifications/email/           # Email templates directory
│   ├── common/layout.nunj        # Base MJML layout
│   ├── user/                     # User-related emails
│   ├── alert/                    # Alert-related emails
│   ├── sighting/                 # Sighting-related emails (to create)
│   └── auth/                     # Auth-related emails (to create)
│
├── user/user.service.ts          # Reference implementation
├── alert/alert.service.ts        # Needs email methods
├── sighting/sighting.service.ts  # Needs email methods
└── auth/services/               # Needs email service/methods
```

## Next Steps

1. Review the [tasks.md](./tasks.md) file
2. Start with Phase 1 tasks to refine User Service implementation
3. Move to Phase 2 (Alert Service) for core email functionality
4. Implement Phase 4 (Auth Service) for security-related emails
5. Add tests and documentation in Phase 6

## Related Documentation

- [Email Module Documentation](../../modules/EMAIL_MODULE.md)
- [Email Quick Start Guide](../../EMAIL_QUICKSTART.md)
- [Email Migration Guide](../../EMAIL_MIGRATION_GUIDE.md)
- [Email Sending Reproduction Guide](../email-sending/email-sending-reproduction-guide.md)

## Contact & Questions

If you have questions about this implementation plan:
1. Review the reference implementation in `src/user/user.service.ts`
2. Check the [tasks.md](./tasks.md) for specific guidance
3. Refer to existing email documentation in `docs/modules/EMAIL_MODULE.md`

---

**Status:** Planning Phase  
**Created:** 2026-02-08  
**Last Updated:** 2026-02-08
