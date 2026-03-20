package com.example.NeteaseCloudMusic.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class NeteaseSearchResponse {
    private SearchResult result;
    private int code;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SearchResult {
        private List<NeteaseSong> songs;
        private int songCount;
    }
}