package vn.fs.dto.chat;

public class ChatStatusDto {

	private final String provider;
	private final String model;
	private final boolean aiEnabled;

	public ChatStatusDto(String provider, String model, boolean aiEnabled) {
		this.provider = provider;
		this.model = model;
		this.aiEnabled = aiEnabled;
	}

	public String getProvider() { return provider; }
	public String getModel() { return model; }
	public boolean isAiEnabled() { return aiEnabled; }
	public String getArchitecture() { return aiEnabled ? "tools-v4" : "dialogue-v3-local"; }
}
