using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentScheduleService {
  CreateSchedule(...CreateScheduleRequest): CreateScheduleResponse;
  GetSchedule(...GetScheduleRequest): GetScheduleResponse;
  ListSchedules(...ListSchedulesRequest): ListSchedulesResponse;
  CancelSchedule(...CancelScheduleRequest): CancelScheduleResponse;
}

@message
model CreateScheduleRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) thread_id: string;
  @field(4) schedule_spec: string;
}

@message
model CreateScheduleResponse {
  @field(1) schedule: AgentSchedule;
}

@message
model GetScheduleRequest {
  @field(1) agent_id: string;
  @field(2) schedule_id: string;
}

@message
model GetScheduleResponse {
  @field(1) schedule: AgentSchedule;
}

@message
model ListSchedulesRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
}

@message
model ListSchedulesResponse {
  @field(1) schedules: AgentSchedule[];
  @field(2) page: PageResponse;
}

@message
model CancelScheduleRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) schedule_id: string;
}

@message
model CancelScheduleResponse {
  @field(1) schedule: AgentSchedule;
}
