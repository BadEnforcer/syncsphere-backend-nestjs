import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiParam,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  DmConversationDetailsResponse,
  GroupConversationDetailsResponse,
} from './conversation.dto';

/**
 * Controller for conversation-related operations.
 * All endpoints require authentication.
 */
@ApiTags('Conversation')
@ApiCookieAuth('better-auth.session_token')
@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * Returns details of a specific conversation.
   * For group conversations: includes group info and member list with roles.
   * For DM conversations: includes the other participant's details.
   */
  @Get('/:conversationId')
  @ApiParam({
    name: 'conversationId',
    description: 'ID of the conversation to retrieve',
  })
  @ApiOkResponse({
    description: 'Conversation details (structure varies by type)',
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/DmConversationDetailsResponse' },
        { $ref: '#/components/schemas/GroupConversationDetailsResponse' },
      ],
    },
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found or user is not a participant',
  })
  async getConversationDetails(
    @Param('conversationId') conversationId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.conversationService.getConversationDetails(
      conversationId,
      currentUser,
    );
  }
}

// Export response types for Swagger schema registration
export { DmConversationDetailsResponse, GroupConversationDetailsResponse };
