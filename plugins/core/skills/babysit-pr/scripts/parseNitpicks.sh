#!/usr/bin/env bash
# parseNitpicks.sh — Parse CodeRabbit review-body comments from PR review bodies.
# Copied from plugins/core/skills/unresolved-pr-comments/scripts/parseNitpicks.sh
# with one addition: each emitted nitpick includes a stable `fingerprint` field
# (sha256 of file + normalized line range + title + body), so reposted reviews
# dedupe to the same fingerprint. Source review timestamps are kept as
# `createdAt` metadata but NOT included in the fingerprint.
#
# Sourced by unresolvedPrComments.sh. Requires: jq, perl with Digest::SHA + Encode.

extract_nitpick_comments() {
  local reviews_json="$1"

  printf '%s' "$reviews_json" | perl -e '
use strict;
use warnings;
use JSON::PP;
use Digest::SHA qw(sha256_hex);
use Encode qw(encode_utf8);

local $/;
my $reviews_json = <STDIN>;
my $reviews = decode_json($reviews_json);

my $latest_review;
my $latest_time = "";
for my $review (@$reviews) {
  my $author = $review->{author}{login} // "";
  my $body = $review->{body} // "";
  next unless $author eq "coderabbitai" && has_supported_sections($body);
  my $created = $review->{createdAt} // "";
  if ($created gt $latest_time) {
    $latest_time = $created;
    $latest_review = $review;
  }
}

unless ($latest_review) {
  print "[]";
  exit 0;
}

my $body = $latest_review->{body};
my $author = $latest_review->{author}{login} // "deleted-user";
my $created_at = $latest_review->{createdAt} // "";

my @sections = extract_review_body_comment_sections($body);
unless (@sections) {
  print "[]";
  exit 0;
}

my @comments;
for my $section (@sections) {
  my $section_content = $section->{content};
  my $category = $section->{category};

  while ($section_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
    my $raw_file_name = trim($1);
    my $file_content = $2;

    while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*(?:_[^_]+_\s*\|\s*_[^_]+_\s*)?\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
      my $line_range = $1;
      my $title = trim($2);
      my $clean_body = clean_comment_body(trim($3));
      my $file_name = normalize_file_name($raw_file_name, $line_range);

      # Fingerprint: file + normalized line + title + body (NO timestamp,
      # NO author, NO category — reposted reviews must dedupe to the same
      # fingerprint even if CodeRabbit relabels the section).
      my $fingerprint_input = join("\n", $file_name, $line_range, $title, $clean_body);
      my $fingerprint = substr(sha256_hex(encode_utf8($fingerprint_input)), 0, 16);

      push @comments, {
        author      => $author,
        body        => "$title\n\n$clean_body",
        category    => $category,
        createdAt   => $created_at,
        file        => $file_name,
        fingerprint => $fingerprint,
        line        => $line_range,
        title       => $title,
      };
    }
  }
}

print encode_json(\@comments);

sub has_supported_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);
  return $text =~ /<summary>\s*[^<]*(?:Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/i;
}

sub extract_review_body_comment_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);

  my @sections;
  while ($text =~ /<summary>\s*[^<]*(Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/ig) {
    my $category = section_category($1);
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

    my $depth = 1;
    my @tags;
    while ($after =~ /(<blockquote>|<\/blockquote>)/gi) {
      my $tag = $1;
      my $pos = $-[0];
      my $is_open = ($tag =~ /^<blockquote>/i) ? 1 : 0;
      push @tags, [$pos, $is_open];
    }
    for my $tag (@tags) {
      $depth += $tag->[1] ? 1 : -1;
      if ($depth == 0) {
        push @sections, {
          category => $category,
          content  => substr($after, 0, $tag->[0]),
        };
        last;
      }
    }
  }
  return @sections;
}

sub section_category {
  my ($label) = @_;
  return "nitpick" if $label =~ /Nitpick comments/i;
  return "minor" if $label =~ /Minor comments/i;
  return "outside-diff" if $label =~ /Outside diff range comments/i;
  return "unknown";
}

sub normalize_file_name {
  my ($file_name, $line_range) = @_;
  my $suffix = "-" . $line_range;
  $file_name =~ s/\Q$suffix\E$//;
  return $file_name;
}

sub strip_markdown_blockquote_prefixes {
  my ($text) = @_;
  $text =~ s/^[ \t]*>[ \t]?//mg;
  return $text;
}

sub clean_comment_body {
  my ($text) = @_;
  my $prev = "";
  while ($text ne $prev) {
    $prev = $text;
    $text =~ s/<details>(?:(?!<details>)[\s\S])*?<\/details>//g;
  }
  # Do NOT HTML-escape angle brackets: the nitpick body is posted back to GitHub
  # as Markdown via `gh api`, where `&lt;`/`&gt;` would render literally and
  # corrupt generic-type expressions or HTML snippets from the original review.
  return trim($text);
}

sub trim {
  my ($s) = @_;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}
'
}

# Extract code scanning alert number from comment body.
extract_code_scanning_alert_number() {
  local body="$1"
  printf '%s' "$body" | perl -ne 'print $1 if m{/code-scanning/(\d+)}'
}
