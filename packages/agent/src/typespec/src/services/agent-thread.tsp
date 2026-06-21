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
}

@message
model ListSectionsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) page?: PageRequest;
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
}

@message
model GetThreadMemoryRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
}

@message
model GetThreadMemoryResponse {
  @field(1) memory?: ThreadMemory;
}

@message
model SearchThreadHistoryRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) query: string;
  @field(4) page?: PageRequest;
}

@message
model SearchThreadHistoryResponse {
  @field(1) results: ThreadHistoryResult[];
  @field(2) page: PageResponse;
}
