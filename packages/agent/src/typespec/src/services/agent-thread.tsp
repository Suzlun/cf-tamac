using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentThreadService {
  ListThreads(...ListThreadsRequest): ListThreadsResponse;
  GetThread(...GetThreadRequest): GetThreadResponse;
  ListSections(...ListSectionsRequest): ListSectionsResponse;
  GetLatestCompaction(...GetLatestCompactionRequest): GetLatestCompactionResponse;
  GetThreadMemory(...GetThreadMemoryRequest): GetThreadMemoryResponse;
  SearchThreadHistory(...SearchThreadHistoryRequest): SearchThreadHistoryResponse;
}

@message
model ListThreadsRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
  @field(3) status?: string;
  @field(4) thread_key_prefix?: string;
}

@message
model ListThreadsResponse {
  @field(1) threads: AgentThread[];
  @field(2) page: PageResponse;
}

@message
model GetThreadRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
}

@message
model GetThreadResponse {
  @field(1) thread: AgentThread;
  @field(2) current_section?: AgentThreadSection;
  @field(3) latest_event?: AgentEvent;
  @field(4) latest_run?: AgentRun;
}

@message
model ListSectionsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) page?: PageRequest;
  @field(4) sequence_range?: TimeRange;
}

@message
model ListSectionsResponse {
  @field(1) sections: AgentThreadSection[];
  @field(2) page: PageResponse;
}

@message
model GetLatestCompactionRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
}

@message
model GetLatestCompactionResponse {
  @field(1) compaction?: ThreadCompaction;
  @field(2) snapshot?: CompactionSnapshotReference;
}

@message
model GetThreadMemoryRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
}

@message
model GetThreadMemoryResponse {
  @field(1) memory?: ThreadMemory;
  @field(2) items: ThreadMemoryItem[];
}

@message
model SearchThreadHistoryRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) query: string;
  @field(4) page?: PageRequest;
  @field(5) filter?: ThreadHistoryFilter;
}

@message
model SearchThreadHistoryResponse {
  @field(1) results: ThreadHistoryResult[];
  @field(2) page: PageResponse;
}
