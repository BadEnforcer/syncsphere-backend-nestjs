import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  DmConversationDetailsResponse,
  GroupConversationDetailsResponse,
  GetConversationsQueryDto,
  GetConversationsResponse,
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
   * Returns all conversations for the current user.
   * Includes both direct messages and group conversations with their last message and metadata.
   * Excludes conversations with no messages.
   * Sorted by most recent message first.
   */
  @Get('/')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Maximum number of conversations to return (default: 50, max: 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of conversations to skip for pagination (default: 0)',
  })
  @ApiOkResponse({
    description: 'List of user conversations with metadata',
    type: GetConversationsResponse,
  })
  async getUserConversations(
    @Query() query: GetConversationsQueryDto,
    @Session() currentUser: UserSession,
  ) {
    return this.conversationService.getUserConversations(
      currentUser.user.id,
      query.limit,
      query.offset,
    );
  }

  /**
   * Returns only conversations with unread messages for the current user.
   * Sorted by most recent message first.
   */
  @Get('/unread')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Maximum number of conversations to return (default: 50, max: 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of conversations to skip for pagination (default: 0)',
  })
  @ApiOkResponse({
    description: 'List of unread conversations with metadata',
    type: GetConversationsResponse,
  })
  async getUnreadUserConversations(
    @Query() query: GetConversationsQueryDto,
    @Session() currentUser: UserSession,
  ) {
    return this.conversationService.getUnreadUserConversations(
      currentUser.user.id,
      query.limit,
      query.offset,
    );
  }

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
